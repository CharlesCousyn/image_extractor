import * as tensorflow from '@tensorflow/tfjs-node-gpu'
import sharp from 'sharp'
import filesSystem from 'fs'
import { from, of , ReplaySubject} from 'rxjs'
import { filter, map, concatMap, tap, groupBy, reduce, mergeMap, mergeAll, toArray, take, bufferCount } from 'rxjs/operators'
import arrayOfLabels from './configFiles/imageNetLabels.json'
import MODELS_CONFIG from './configFiles/modelsConfig.json'
import GENERAL_CONFIG from "./configFiles/generalConfig.json"

//const isPicture = /^.*\.(jpg|png|gif|bmp|jpeg)/i;
const isPicture = /^.*\.(jpg|png|gif|jpeg)/i;

const BATCH_FILE_SIZE_LIMIT = 5242880; //Doesn't work with const BUFFER_COUNT = 17;

const BUFFER_COUNT = 6;
const NUMBER_OF_BEST_PREDICTIONS = 25;

const WIDTH_REQUIRED = 331;
const HEIGHT_REQUIRED = 331;

//Choose the model
const MODEL_CONFIG = MODELS_CONFIG.find(config => config.name === "mobilenet_v2_140_224");

//TODO: Accept models of classification and object detection
//TODO: Accept multiple ways of aggregation
//TODO: Resize images in a different folder from original to keep original images

function keepValidFileImageObj(imageObj)
{
	return isPicture.test(imageObj.pathToImage);
}

function keepLittleFileImageObj(imageObj)
{
	return imageObj.size < BATCH_FILE_SIZE_LIMIT;
}

//file as {path, size}
//5.5mo max !!
function addSizeInformationImageObj(imageObj)
{
	imageObj["size"] = filesSystem.statSync(imageObj.pathToImage).size;
	return imageObj;
}

async function resizeAndSaveImageIfBadDimensionsImageObj(imageObj)
{
	const imagePath = imageObj.pathToImage;
	try
	{
		//Enable file writing with the same name
		sharp.cache(false);

		const image = sharp(imagePath);
		const metadata = await image.metadata();

		//Resize only if not the good dimensions
		if(metadata.height !== HEIGHT_REQUIRED || metadata.width !== WIDTH_REQUIRED)
		{
			const buffer = await sharp(imagePath)
			.resize({
				width: WIDTH_REQUIRED,
				height: HEIGHT_REQUIRED,
				kernel: "nearest",
				fit: "contain"
			})
			.toBuffer();

			filesSystem.writeFileSync(imagePath, buffer);
		}
	}
	catch (e) {
		console.error(e);
	}

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
			return {"activityName": activityFolderName, "pathToImage":`${pathToActivityFolder}${imageName}`}
		}));
}

function writeJSONFile(data, path)
{
	filesSystem.writeFileSync(path, JSON.stringify(data, null, 4), "utf8");
}

function createResultFile(data, activityName)
{
	const resultPath = `./resultFiles/${activityName}`;

	if (!filesSystem.existsSync(resultPath))
	{
		filesSystem.mkdirSync(resultPath);
	}

	writeJSONFile(data, `${resultPath}/results.json`);
}

function processValidImages(groupedObservableValidImageOneActivity, MODEL)
{
	let activityFolderName = groupedObservableValidImageOneActivity.key;

	console.log(activityFolderName);

	return groupedObservableValidImageOneActivity
	.pipe(bufferCount(BUFFER_COUNT))
	//.pipe(tap(x => console.log("afterbufferCount", x)))
	.pipe(concatMap(someImageObjs =>
	{
		//console.log("someImageObjs: ", someImageObjs);
		return from(someImageObjs)
		.pipe(mergeMap(imageObj => load(imageObj.pathToImage)))
		//Stream de tenseurs
		.pipe(toArray())
		//Stream de array de tenseurs (1 seule array)
		.pipe(map(arrayOfTensors =>
		{
			console.log(arrayOfTensors.map(tens => tens.shape));
			const bigTensor = tensorflow.concat(arrayOfTensors, 0);
			console.log(bigTensor.shape);
			if(arrayOfTensors.length !== 1)
			{
				tensorflow.dispose(arrayOfTensors);
			}

			return bigTensor;
		}))
		//Stream de bigTensor (1 seul)
		.pipe(map(bigTensor => classify(bigTensor, MODEL)));
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
	.pipe(take(NUMBER_OF_BEST_PREDICTIONS))
	//Stream de prédictions réduites triée de manière décroissante, seulement les 25 premiers éléments émis
	.pipe(tap(x => console.log(activityFolderName, "pred: ", x)))
	.pipe(toArray())
	.pipe(map(array => createResultFile(array, activityFolderName)));
}

function classify(pictures, MODEL)
{
	//Doing a prediction
	const predictions = MODEL.predict(pictures);

	//Free the memory of the tensor pictures
	tensorflow.dispose(pictures);

	//Transform predictions to be readable
	return from(predictions.arraySync().map(prediction => from(prediction.map((value, index) => [arrayOfLabels[index], value]))));
}

function handleValids(stream, MODEL) {
	return (
		stream.pipe(filter(keepValidFileImageObj))
			  .pipe(mergeMap(imageObj => from(resizeAndSaveImageIfBadDimensionsImageObj(imageObj)))) //Stream de imageObj
			  .pipe(map(addSizeInformationImageObj)) //Stream de imageObj
			  .pipe(filter(keepLittleFileImageObj)) //Stream de imageObj
			  .pipe(groupBy(imageObj => imageObj.activityName, undefined, undefined, () => new ReplaySubject()))
			  .pipe(concatMap(groupByActivity => processValidImages(groupByActivity, MODEL)))
	).toPromise()
}

function handleInvalids(stream) {
	return stream.pipe(filter(x => !keepValidFileImageObj(x)))
		  	     .pipe(toArray())
		  	     .pipe(tap(x => console.log("Bad images: ", x)))
		   	     .pipe(map(badImages => writeJSONFile(badImages, "./resultFiles/badImages.json")))
	             .toPromise()
}

function run(MODEL)
{
	const all = from(filesSystem.readdirSync(GENERAL_CONFIG.pathToFolderActivityImages, { encoding: 'utf8' }))
					.pipe(mergeMap(readActivityFolder));//Stream de string de folders

	Promise.all([handleValids(all, MODEL), handleInvalids(all)])
	.then(function ([valids, invalids]) {
		console.log("Analyse finie");
		MODEL.dispose();

		console.log(valids);
		console.log(invalids);
	})
}

tensorflow.loadGraphModel(`file://models/${MODEL_CONFIG.name}/model.json`).then(run);
