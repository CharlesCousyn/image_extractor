import * as tensorflow from '@tensorflow/tfjs-node-gpu'
import coco_classes from '../labelFiles/coco_classes.js';
import yolo9000Labels from '../labelFiles/yolo9000Labels.js';

export default class ObjectDetectionModel
{
	constructor(MODEL_CONFIG, MODEL)
	{
		this.setModelConfig(MODEL_CONFIG);
		if(MODEL !== undefined)
		{
			this.MODEL = MODEL;
		}
	}

	setModel(MODEL)
	{
		this.MODEL = MODEL;
	}

	setModelConfig(MODEL_CONFIG)
	{
		this.type = MODEL_CONFIG.type;
		this.widthRequired = MODEL_CONFIG.widthRequired;
		this.heightRequired = MODEL_CONFIG.heightRequired;
		this.name = MODEL_CONFIG.name;
		this.maxBoxes = MODEL_CONFIG.maxBoxes;
		this.scoreThreshold = MODEL_CONFIG.scoreThreshold;
		this.iouThreshold = MODEL_CONFIG.iouThreshold;
		this.anchors = MODEL_CONFIG.anchors;
		this.bufferCount = 1;
		if(MODEL_CONFIG.v3_masks !== undefined)
		{
			this.v3_masks = MODEL_CONFIG.v3_masks;
		}

		//ClassNames
		switch (MODEL_CONFIG.labelFile)
		{
			case "coco_classes":
				this.classNames = coco_classes;
				break;
			case "yolo9000Labels":
				this.classNames = yolo9000Labels;
				break;
			default:
				this.classNames = [];
		}
	}

	async predictOrClassify(pictures)
	{
		const boundingBoxes = await this.detectObjects(pictures);
		//const boundingBoxes = await this.detectObjectsMock(pictures);

		//From bounding box to prediction
		return boundingBoxes.map(box => [box.class, box.score]);
	}

	async detectObjectsMock(pictures)
	{
		return [{class: "test1", score: 0.5}, {class: "test2", score: 0.4}];
	}

	//return bounding box object:
	// {   top: 0,
	//     left: 367.5745849609375,
	//     bottom: 44.1000862121582,
	//     right: 414.0556945800781,
	//     height: 44.1000862121582,
	//     width: 46.481109619140625,
	//     score: 0.2654210925102234,
	//     class: 'carrot'
	//     }
	async detectObjects(pictures)
	{
		//Doing a prediction
		const predictions = this.MODEL.predict(pictures);

		//Free the memory of the tensor pictures
		tensorflow.dispose(pictures);

		//Transform predictions to be readable (from tensor to couple of label and associated score)
		return await this.postProcess(predictions);
	}

	async postProcess(
	outputs,
	anchors = this.anchors,
	numClasses = this.classNames.length,
	classNames = this.classNames,
	imageShape = [this.widthRequired, this.heightRequired],
	// maxBoxesPerClass,
	maxBoxes = this.maxBoxes,
	scoreThreshold = this.scoreThreshold,
	iouThreshold = this.iouThreshold)
	{
		const isV3 = this.name.indexOf("v3") > -1;
		const [boxes, boxScores] = this.yoloEval(isV3, outputs, anchors, numClasses, imageShape);

		//Free memory of output
		tensorflow.dispose(outputs);

		let boxes_ = [];
		let scores_ = [];
		let classes_ = [];

		const _classes = tensorflow.argMax(boxScores, -1);
		const _boxScores = tensorflow.max(boxScores, -1);

		// const splitBoxScores = boxScores.split(numClasses, 1);

		// for (let i = 0; i < numClasses; i++) {
		//   const _boxScores = splitBoxScores[i].as1D();
		const nmsIndex = await tensorflow.image.nonMaxSuppressionAsync(
			boxes,
			_boxScores,
			// maxBoxesPerClass,
			maxBoxes,
			iouThreshold,
			scoreThreshold
		);

		if (nmsIndex.size)
		{
			tensorflow.tidy(() =>
			{
				const classBoxes = tensorflow.gather(boxes, nmsIndex);
				const classBoxScores = tensorflow.gather(_boxScores, nmsIndex);
				// const classes = tensorflow.mul(tensorflow.onesLike(classBoxScores), i);

				classBoxes.split(nmsIndex.size).map(box => {
					boxes_.push(box.dataSync());
				});
				classBoxScores.dataSync().map(score => {
					scores_.push(score);
				});
				// classes.dataSync().map(cls => {
				//   classes_.push(cls);
				// });
				classes_ = _classes.gather(nmsIndex).dataSync();
			});
		}
		_boxScores.dispose();
		_classes.dispose();
		nmsIndex.dispose();
		// }

		boxes.dispose();
		boxScores.dispose();
		// tensorflow.dispose(splitBoxScores);

		return boxes_.map((box, i) => {
			const top = Math.max(0, box[0]);
			const left = Math.max(0, box[1]);
			const bottom = Math.min(imageShape[0], box[2]);
			const right = Math.min(imageShape[1], box[3]);
			const height = bottom - top;
			const width = right - left;
			return {
				top,
				left,
				bottom,
				right,
				height,
				width,
				score: scores_[i],
				class: classNames[classes_[i]]
			}
	});
}

	yoloEval(
	isV3,
	outputs,
	anchors,
	numClasses,
	imageShape)
	{
		return tensorflow.tidy(() =>
		{
			let numLayers = 1;
			let inputShape;
			let anchorMask;

			if (isV3) {
				numLayers = outputs.length;
				anchorMask = this.v3_masks[numLayers];
				inputShape = outputs[0].shape.slice(1, 3).map(num => num * 32);
			} else {
				inputShape = outputs.shape.slice(1, 3);
			}

			const anchorsTensor = tensorflow.tensor1d(anchors).reshape([-1, 2]);
			let boxes = [];
			let boxScores = [];

			for (let i = 0; i < numLayers; i++) {
				const [_boxes, _boxScores] = this.yoloBoxesAndScores(
					isV3,
					isV3 ? outputs[i] : outputs,
					isV3 ? anchorsTensor.gather(tensorflow.tensor1d(anchorMask[i], 'int32')) : anchorsTensor,
					numClasses,
					inputShape,
					imageShape
				);

				boxes.push(_boxes);
				boxScores.push(_boxScores);
			}

			boxes = tensorflow.concat(boxes);
			boxScores = tensorflow.concat(boxScores);

			return [boxes, boxScores];
		});
}

	yoloBoxesAndScores(
	isV3,
	feats,
	anchors,
	numClasses,
	inputShape,
	imageShape)
	{
		return tensorflow.tidy(() =>
		{
			const [boxXy, boxWh, boxConfidence, boxClassProbs] = this.yoloHead(isV3, feats, anchors, numClasses, inputShape);

			let boxes = this.yoloCorrectBoxes(boxXy, boxWh, imageShape);
			boxes = boxes.reshape([-1, 4]);
			let boxScores = tensorflow.mul(boxConfidence, boxClassProbs);
			boxScores = tensorflow.reshape(boxScores, [-1, numClasses]);

			return [boxes, boxScores];
		});
	}

	yoloHead(
	isV3,
	feats,
	anchors,
	numClasses,
	inputShape)
	{
		return tensorflow.tidy(() =>
		{
			const numAnchors = anchors.shape[0];
			// Reshape to height, width, num_anchors, box_params.
			const anchorsTensor = tensorflow.reshape(anchors, [1, 1, numAnchors, 2]);

			const gridShape = feats.shape.slice(1, 3); // height, width

			const gridY = tensorflow.tile(tensorflow.reshape(tensorflow.range(0, gridShape[0]), [-1, 1, 1, 1]), [1, gridShape[1], 1, 1]);
			const gridX = tensorflow.tile(tensorflow.reshape(tensorflow.range(0, gridShape[1]), [1, -1, 1, 1]), [gridShape[0], 1, 1, 1]);
			const grid = tensorflow.concat([gridX, gridY], 3).cast(feats.dtype);

			feats = feats.reshape([gridShape[0], gridShape[1], numAnchors, numClasses + 5]);

			const [xy, wh, con, probs] = tensorflow.split(feats, [2, 2, 1, numClasses], 3);
			// Adjust preditions to each spatial grid point and anchor size.
			const boxXy = tensorflow.div(tensorflow.add(tensorflow.sigmoid(xy), grid), gridShape.reverse());
			const boxWh = tensorflow.div(tensorflow.mul(tensorflow.exp(wh), anchorsTensor), inputShape.reverse());
			const boxConfidence = tensorflow.sigmoid(con);

			let boxClassProbs;
			if (isV3)
			{
				boxClassProbs = tensorflow.sigmoid(probs);
			} else {
				boxClassProbs = tensorflow.softmax(probs);
			}

			return [boxXy, boxWh, boxConfidence, boxClassProbs];
		});
	}

	yoloCorrectBoxes(
	boxXy,
	boxWh,
	imageShape)
	{
		return tensorflow.tidy(() =>
		{
			let boxYx = tensorflow.concat(tensorflow.split(boxXy, 2, 3).reverse(), 3);
			let boxHw = tensorflow.concat(tensorflow.split(boxWh, 2, 3).reverse(), 3);

			// Scale boxes back to original image shape.
			const boxMins = tensorflow.mul(tensorflow.sub(boxYx, tensorflow.div(boxHw, 2)), imageShape);
			const boxMaxes = tensorflow.mul(tensorflow.add(boxYx, tensorflow.div(boxHw, 2)), imageShape);

			const boxes = tensorflow.concat([
				...tensorflow.split(boxMins, 2, 3),
				...tensorflow.split(boxMaxes, 2, 3)
			], 3);

			return boxes;
		});
	}
}