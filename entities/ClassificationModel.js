import arrayOfLabels from "../labelFiles/imageNetLabels.js";
import * as tensorflow from '@tensorflow/tfjs-node-gpu'
import { from} from 'rxjs'

export default class ClassificationModel
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
		this.bufferCount = MODEL_CONFIG.bufferCount;
		this.labelFile = MODEL_CONFIG.labelFile;
		this.needNormalization = MODEL_CONFIG.needNormalization;
	}

	predictOrClassify(pictures)
	{
		return this.classify(pictures);
	}

	classify(pictures)
	{
		//Doing a prediction
		let predictions = this.MODEL.predict(pictures);

		if(this.needNormalization)
		{
			predictions = tensorflow.softmax(predictions);
		}

		//Free the memory of the tensor pictures
		tensorflow.dispose(pictures);

		//Transform predictions to be readable (from tensor to couple of label and associated score)
		return from(predictions.arraySync().map(prediction => from(prediction.map((value, index) => [arrayOfLabels[index], value]))));
	}


}