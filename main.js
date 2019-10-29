import * as tensorflow from '@tensorflow/tfjs-node-gpu'
import sharp from 'sharp'
import filesSystem from 'fs'
import { from, of, ReplaySubject} from 'rxjs'
import { filter, map, concatMap, tap, groupBy, reduce, mergeMap, mergeAll, toArray, take, bufferCount } from 'rxjs/operators'
import arrayOfLabels from './labelFiles/imageNetLabels.json'
import MODELS_CONFIG from './configFiles/modelsConfig.json'
import GENERAL_CONFIG from "./configFiles/generalConfig.json"
import ClassificationModel from "./entities/ClassificationModel";
import coco_classes from "./labelFiles/coco_classes";
import yolo9000Labels from "./labelFiles/yolo9000Labels";
import ObjectDetectionModel from "./entities/ObjectDetectionModel";

//const isPicture = /^.*\.(jpg|png|gif|bmp|jpeg)/i;
const isPicture = /^.*\.(jpg|png|gif|jpeg)/i;

//TODO: Accept multiple ways of aggregation

function keepValidFileImageObj(imageObj)
{
	return isPicture.test(imageObj.pathToOriginalImage);
}

function keepLittleFileImageObj(imageObj)
{
	return imageObj.size < GENERAL_CONFIG.batchFileSizeLimit;
}

//file as {path, size}
//5.5mo max !!
function addSizeInformationImageObj(imageObj)
{
	imageObj["size"] = filesSystem.statSync(imageObj.pathToOriginalImage).size;
	return imageObj;
}

async function resizeAndSaveImageIfBadDimensionsImageObj(imageObj, MODEL_Obj)
{
	const imageOriginalPath = imageObj.pathToOriginalImage;
	const basePathForResizedImages = `./data/${MODEL_Obj.name}`;

	//Checking if the model folder exists
	if (!filesSystem.existsSync(basePathForResizedImages))
	{
		filesSystem.mkdirSync(basePathForResizedImages);
	}

	//Checking if the resized image exists
	const pathToResizedImage = `${basePathForResizedImages}/${imageObj.imageName}`;
	if(filesSystem.existsSync(pathToResizedImage))
	{
		//Check if height and width OK

		//Enable file writing with the same name
		sharp.cache(false);

		const image = sharp(pathToResizedImage);
		const metadata = await image.metadata();
		//If yes, do nothing, if no resize with the good dimensions
		if(metadata.height !== MODEL_Obj.heightRequired || metadata.width !== MODEL_Obj.widthRequired)
		{
			const buffer = await sharp(imageOriginalPath)
			.resize({
				width: MODEL_Obj.widthRequired,
				height: MODEL_Obj.heightRequired,
				kernel: "nearest",
				fit: "contain"
			})
			.toBuffer();

			filesSystem.writeFileSync(pathToResizedImage, buffer);
		}
	}
	else
	{
		//Create a resized image
		const image = sharp(imageOriginalPath);
		const metadata = await image.metadata();

		try
		{
			const buffer = await sharp(imageOriginalPath)
			.resize({
				width: MODEL_Obj.widthRequired,
				height: MODEL_Obj.heightRequired,
				kernel: "nearest",
				fit: "contain"
			})
			.toBuffer();

			filesSystem.writeFileSync(pathToResizedImage, buffer);
		}
		catch(e)
		{
			console.error(e);
		}
	}

	//Update imageObj
	imageObj["pathToResizedImage"] = pathToResizedImage;

	return imageObj;
}

//Be sure that image at this path is 331x331!!
function load (path)
{
	console.log("path: ", path);
	const tensorsToReturn = tensorflow.tidy(()=>
		{
			//Method for resizing with tensorflow: tensorflow.image.resizeNearestNeighbor(tensor, [HEIGHT_REQUIRED, WIDTH_REQUIRED]);

			//Decode image, and transform from [0, 255] to [0, 1]
			const pictures = tensorflow.div(
					tensorflow.node.decodeImage(new Uint8Array(filesSystem.readFileSync(path)), 3),
					tensorflow.scalar(255, 'float32')
				);

			//Handle GIF
			if (pictures.shape.length === 4)
			{
				return tensorflow.split(pictures, pictures.shape[0], 0);
			}
			else
			{
				return [pictures.reshape([1, ...pictures.shape])];
			}
		}
	);

	if(tensorsToReturn.length !== 1)
	{
		return from(tensorsToReturn);
	}
	else
	{
		return of(tensorsToReturn[0]);
	}
}

function readActivityFolder(activityFolderName)
{
	const pathToActivityFolder = `${GENERAL_CONFIG.pathToFolderActivityImages}${activityFolderName}/`;
	return from(filesSystem.readdirSync(pathToActivityFolder, { encoding: 'utf8' }))
		.pipe(map(imageName =>
		{
			return {
				"activityName": activityFolderName,
				"pathToOriginalImage":`${pathToActivityFolder}${imageName}`,
				"imageName": imageName}
		}));
}

function writeJSONFile(data, path)
{
	filesSystem.writeFileSync(path, JSON.stringify(data, null, 4), "utf8");
}

function createResultFile(data, activityName, MODEL_Obj)
{
	let basePath = `./resultFiles/${MODEL_Obj.name}`;

	if(MODEL_Obj.type === "object_detection")
	{
		basePath += `_${MODEL_Obj.maxBoxes}_${MODEL_Obj.scoreThreshold}_${MODEL_Obj.iouThreshold}`;
	}

	if (!filesSystem.existsSync(basePath))
	{
		filesSystem.mkdirSync(basePath);
	}

	const resultPath = `${basePath}/${activityName}`;
	if (!filesSystem.existsSync(resultPath))
	{
		filesSystem.mkdirSync(resultPath);
	}

	writeJSONFile(data, `${resultPath}/results.json`);
}

function processValidImages(groupedObservableValidImageOneActivity, MODEL_Obj)
{
	let activityFolderName = groupedObservableValidImageOneActivity.key;

	console.log(activityFolderName);

	return groupedObservableValidImageOneActivity
	.pipe(bufferCount(MODEL_Obj.bufferCount))
	//.pipe(tap(x => console.log("afterbufferCount", x)))
	.pipe(concatMap(someImageObjs =>
	{
		//console.log("someImageObjs: ", someImageObjs);
		return from(someImageObjs)
		.pipe(mergeMap(imageObj => load(imageObj.pathToResizedImage)))
		//Stream de tenseurs
		.pipe(toArray())
		//Stream de array de tenseurs (1 seule array)
		.pipe(map(arrayOfTensors =>
		{
			console.log(arrayOfTensors.map(tens => tens.shape));
			let bigTensor;
			if(arrayOfTensors.length !== 1)
			{
				bigTensor = tensorflow.concat(arrayOfTensors, 0);
			}
			else
			{
				bigTensor = tensorflow.clone(arrayOfTensors[0]);
			}

			console.log(bigTensor.shape);
			tensorflow.dispose(arrayOfTensors);

			return bigTensor;
		}))
		//Stream de bigTensor (1 seul)
		.pipe(map(bigTensor => MODEL_Obj.predictOrClassify(bigTensor)));
		//Stream de Stream de prédictions
	}))
	//Stream de Stream de Stream de prédictions
	.pipe(mergeAll())
	//Stream de Stream de Predictions
	.pipe(mergeAll())
	//Stream de Prediction individuelles ici: [ 'pineapple', -0.3546293079853058 ];
	.pipe(groupBy(x => x[0], x => x[1]))
	//Stream de GroupedObservable de prédictions groupées par classes
	.pipe(mergeMap( (groupByClass) => groupByClass
		.pipe(reduce((a, b) => a + b))
		.pipe(map(x => [groupByClass.key, x]))
	))
	//Stream de prédictions réduites (score des prédictions de même classe ajoutés entre eux)
	.pipe(toArray())
	//Stream de array de prédictions réduites (1 seule array) attends toutes les valeurs
	.pipe(map(x => from(x.sort((a, b) => b[1] - a[1]))))
	//Stream de Stream de prédictions réduites triée
	.pipe(mergeAll())
	//Stream de prédictions réduites triée
	.pipe(take(GENERAL_CONFIG.numberOfBestPredictions))
	//Stream de prédictions réduites triée de manière décroissante, seulement les 25 premiers éléments émis
	.pipe(tap(x => console.log(activityFolderName, "pred: ", x)))
	.pipe(toArray())
	.pipe(map(array => createResultFile(array, activityFolderName, MODEL_Obj)));
}

function handleValids(stream, MODEL_Obj)
{
	return stream.pipe(filter(keepValidFileImageObj))
	.pipe(mergeMap(imageObj => from(resizeAndSaveImageIfBadDimensionsImageObj(imageObj, MODEL_Obj)))) //Stream de imageObj
	.pipe(map(addSizeInformationImageObj)) //Stream de imageObj
	.pipe(filter(keepLittleFileImageObj)) //Stream de imageObj
	.pipe(groupBy(imageObj => imageObj.activityName, undefined, undefined, () => new ReplaySubject()))
	.pipe(concatMap(groupByActivity => processValidImages(groupByActivity, MODEL_Obj)))
	.toPromise()
}

function handleInvalids(stream)
{
	return stream.pipe(filter(x => !keepValidFileImageObj(x)))
		  	     .pipe(toArray())
		  	     .pipe(tap(x => console.log("Bad images: ", x)))
		   	     .pipe(map(badImages => writeJSONFile(badImages, "./resultFiles/badImages.json")))
	             .toPromise()
}

async function run(MODEL_Obj)
{
	const all = from(filesSystem.readdirSync(GENERAL_CONFIG.pathToFolderActivityImages, { encoding: 'utf8' }))
					.pipe(mergeMap(readActivityFolder));//Stream de imageObj

	await Promise.all([handleValids(all, MODEL_Obj), handleInvalids(all)]);

	console.log("Analyse finie");

	//Free the memory from the model weights
	MODEL_Obj.MODEL.dispose();
}

//Main function
(async function()
{
	//Choose the model
	const MODEL_CONFIG = MODELS_CONFIG.find(config => config.name === "yolov3-tiny");
	const MODEL = await tensorflow.loadGraphModel(`file://models/${MODEL_CONFIG.name}/model.json`);

	//Get the corresponding class
	let MODEL_Obj;
	switch (MODEL_CONFIG.type)
	{
		case "classification":
			MODEL_Obj = new ClassificationModel(MODEL_CONFIG, MODEL);
			break;
		case "object_detection":
			MODEL_Obj = new ObjectDetectionModel(MODEL_CONFIG, MODEL);
			break;
		default:
			console.log("Bad model type");
			MODEL_Obj = undefined;
	}

	await run(MODEL_Obj);
})();
