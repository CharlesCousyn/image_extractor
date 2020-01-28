import * as tensorflow from '@tensorflow/tfjs-node-gpu'
import filesSystem from 'fs'
import sharp from "sharp"
import { from, of, ReplaySubject, partition} from 'rxjs'
import { filter, map, concatMap, tap, groupBy, reduce, mergeMap, mergeAll, toArray, take, bufferCount, count} from 'rxjs/operators'
import * as base64url from 'base64-url'
import MODELS_CONFIG from './configFiles/modelsConfig.json'
import GENERAL_CONFIG from "./configFiles/generalConfig.json"
import ClassificationModel from "./entities/ClassificationModel";
import ObjectDetectionModel from "./entities/ObjectDetectionModel";
import Image from "./entities/Image";

const isPicture = /^.*\.(jpg|png|gif|jpeg)/i;
//Get the file of results
const fileContainingUrlsPath = `${GENERAL_CONFIG.pathToFolderContainingFileContainingUrls}/${filesSystem.readdirSync(GENERAL_CONFIG.pathToFolderContainingFileContainingUrls, { encoding: 'utf8' })[0]}`;
let RESULTS = JSON.parse(filesSystem.readFileSync(fileContainingUrlsPath));

function keepValidFileImageObj(imageObj)
{
	return isPicture.test(imageObj.pathToOriginalImage);
}

function isReadable(imageObj)
{
	return imageObj.isReadable;
}

function keepLittleFileImageObj(imageObj)
{
	return imageObj.size < GENERAL_CONFIG.batchFileSizeLimit;
}

//file as {path, size}
//5.5mo max !!
function addSizeInformationImageObj(imageObj)
{
	imageObj.size = filesSystem.statSync(imageObj.pathToOriginalImage).size;
	return imageObj;
}

function timeConversion(ms)
{
	let seconds = (ms / 1000).toFixed(1);
	let minutes = (ms / (1000 * 60)).toFixed(1);
	let hours = (ms / (1000 * 60 * 60)).toFixed(1);
	let days = (ms / (1000 * 60 * 60 * 24)).toFixed(1);

	if (seconds < 60) {
		return seconds + " Sec";
	} else if (minutes < 60) {
		return minutes + " Min";
	} else if (hours < 24) {
		return hours + " Hrs";
	} else {
		return days + " Days"
	}
}

function showProgress(currentNumberOfActivitiesCrawled, totalNumberOfActivities, beginTime)
{
	const timeElapsed = timeConversion(new Date() - beginTime);
	console.log(`Progress ${currentNumberOfActivitiesCrawled}/${totalNumberOfActivities} (${100.0 * currentNumberOfActivitiesCrawled/totalNumberOfActivities} %) (${timeElapsed} elapsed)`);
}

async function prepareImages(imageObj, MODEL_Obj, searchEngine)
{
	async function resizeAndWriteImage(imageOriginalPath, pathToResizedImage, MODEL_Obj, resizingMethod)
	{
		const bufToWrite = await sharp(imageOriginalPath)
		.resize({
			width: MODEL_Obj.widthRequired,
			height: MODEL_Obj.heightRequired,
			kernel: "nearest",
			fit: "contain"
		})
		.toBuffer();

		filesSystem.writeFileSync(pathToResizedImage, bufToWrite);
	}

	const imageOriginalPath = imageObj.pathToOriginalImage;
	const basePathForResizedImages = `./data/${searchEngine}/${MODEL_Obj.name}`;

	//Checking if the model folder exists
	if (!filesSystem.existsSync(basePathForResizedImages))
	{
		filesSystem.mkdirSync(basePathForResizedImages);
	}

	//Checking if the resized image exists
	const pathToResizedImage = `${basePathForResizedImages}/${imageObj.imageName}`;
	try
	{
		if (filesSystem.existsSync(pathToResizedImage))
		{
			//Check if height and width OK
			const image = await sharp(pathToResizedImage);
			const imageMeta = await image.metadata();
			//If yes, do nothing, if no resize with the good dimensions
			if (imageMeta.height !== MODEL_Obj.heightRequired || imageMeta.width !== MODEL_Obj.widthRequired)
			{
				//Create a resized image
				await resizeAndWriteImage(imageOriginalPath, pathToResizedImage, MODEL_Obj, /*resizingMethod*/);
			}
		}
		else
		{
			//Create a resized image
			await resizeAndWriteImage(imageOriginalPath, pathToResizedImage, MODEL_Obj, /*resizingMethod*/)
		}
	}
	catch(e)
	{
		console.error("prepareImages: ", e, "\n"+imageOriginalPath);
		imageObj.isReadable = false;
	}

	//Update imageObj
	imageObj.pathToResizedImage = pathToResizedImage;

	return imageObj;
}

//Be sure that image at this path is 331x331!!
function load (path)
{
	//console.log("path: ", path);

	try
	{
		const tensorsToReturn = tensorflow.tidy(()=>
			{
				//Method for resizing with tensorflow: tensorflow.image.resizeNearestNeighbor(tensor, [HEIGHT_REQUIRED, WIDTH_REQUIRED]);

				//Decode image, and transform from [0, 255] to [0, 1]

				const pictures = tensorflow.div(
					tensorflow.node.decodeImage(new Uint8Array(filesSystem.readFileSync(path)), 3, undefined, true),
					tensorflow.scalar(255, 'float32'));

				//Handle GIF
				if (pictures.shape.length === 4)
				{
					//Split a 4D tensor to an array of 4D tensors
					return tensorflow.split(pictures, pictures.shape[0], 0);
				}
				else
				{
					//Transform a 3D tensor to an array with only 4D tensor
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
	catch(e)
	{
		console.error(e)
	}

	return tensorflow.tensor([]);

}

function readActivityFolderByRelevance(activityFolderName, RESULTS)
{
	//Need to sort the files!!

	//Sorted array of results
	const goodResultObject = RESULTS.find(activityRes => activityRes.folderName === activityFolderName);
	const pathToActivityFolder = `${GENERAL_CONFIG.pathToFolderActivityImages}${activityFolderName}/`;
	//Unsorted array of file names
	const arrayOfFilesWithoutExtension = filesSystem.readdirSync(pathToActivityFolder, { encoding: 'utf8'}).map(name => name.split(".")[0]);

	//Sorted array of file names
	let goodResults = goodResultObject.results
		.filter( res => arrayOfFilesWithoutExtension.indexOf(base64url.encode(res.urlImage)) !== -1)
		.map(res => {
			let arraySplit = res.urlImage.split("?").shift().split(".");
			return `${base64url.encode(res.urlImage)}.${arraySplit[arraySplit.length - 1]}`;
		});

	//Produce a Stream of images order by pertinence in search engine in descending order
	return from(goodResults)
		.pipe(map(imageName => new Image(activityFolderName, `${pathToActivityFolder}${imageName}`, imageName)));
}

function writeJSONFile(data, path)
{
	filesSystem.writeFileSync(path, JSON.stringify(data, null, 4), "utf8");
}

function createResultFile(arrayOfPred, activityName, modelId, searchEngine, numberOfResultsUsed, aggregationType, MODEL_Obj)
{
	const combination = [modelId, searchEngine, numberOfResultsUsed, aggregationType];
	let basePath = `./resultFiles/${combination.join(" ")}`;

	if (!filesSystem.existsSync(basePath))
	{
		filesSystem.mkdirSync(basePath);
	}

	const resultPath = `${basePath}/${activityName}.json`;

	//Construct data
	const data = {query: activityName, data: arrayOfPred.map(elem => ({label: elem[0], relevance: elem[1], correct: null}) )};
	writeJSONFile(data, resultPath);
}

function aggregateScores(aggregationType)
{
	switch (aggregationType)
	{
		case "sum":
			return (total, current) => total + current;
		case "sumSquaredValue":
			return (total, current) => total + current * current;
		case "sumLog":
			return (total, current) => total + Math.log(current);
		default:
			return (total, current) => total + current;
	}
}

function processValidImages(groupedObservableValidImageOneActivity, MODEL_Obj, modelId, searchEngine, numberOfResultsUsed, aggregationType)
{
	const combination = [modelId, searchEngine, numberOfResultsUsed, aggregationType];
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
			return tensorflow.tidy(() =>
			{
				let bigTensor = tensorflow.concat(arrayOfTensors, 0);
				console.log(bigTensor.shape);
				return bigTensor;
			});
		}))
		//Stream de bigTensor (1 seul)
		.pipe(map(bigTensor => MODEL_Obj.predictOrClassify(bigTensor)))
		.pipe(tap(() =>
		{
			currentNumberOfImagesAnalysed += someImageObjs.length;
			showProgress(currentNumberOfImagesAnalysed, totalNumberOfImages, beginTime);
		}));
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
		.pipe(reduce(aggregateScores(aggregationType)))
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
	.pipe(map(array => createResultFile(array, activityFolderName, ...combination, MODEL_Obj)));
}

function handleValids(valids, MODEL_Obj, modelId, searchEngine, numberOfResultsUsed, aggregationType)
{
	const combination = [modelId, searchEngine, numberOfResultsUsed, aggregationType];
	let [readable, notReadable] = partition(valids.pipe(mergeMap(imageObj => from(prepareImages(imageObj, MODEL_Obj, searchEngine)))), isReadable)//Stream de imageObj

	let readablePromise = readable
		.pipe(take(numberOfResultsUsed))////Stream de imageObj
		.pipe(map(addSizeInformationImageObj)) //Stream de imageObj
		.pipe(filter(keepLittleFileImageObj)) //Stream de imageObj
		.pipe(groupBy(imageObj => imageObj.activityName, undefined, undefined, () => new ReplaySubject()))
		.pipe(concatMap(groupByActivity => processValidImages(groupByActivity, MODEL_Obj, ...combination)))
		.toPromise();

	let notReadablePromise = notReadable
		.pipe(tap( () => {totalNumberOfImages--;}))
		.pipe(toArray())
		.pipe(map(notReadableImages => writeJSONFile(notReadableImages, "./resultFiles/notReadableImages.json")))
		.toPromise();

	return notReadablePromise.then(() => readablePromise);
}

function handleInvalids(invalids)
{
	return invalids
		.pipe(tap(x =>
		{
			console.log("Bad image: ", x);
			totalNumberOfImages--;
			//currentNumberOfImagesAnalysed += x.length;
			showProgress(currentNumberOfImagesAnalysed, totalNumberOfImages, beginTime);
		}))
		.pipe(toArray())
		.pipe(map(badImages => writeJSONFile(badImages, "./resultFiles/badImages.json")))
		.toPromise()
}

export default async function run(chosenModelId, searchEngine, numberOfResultsUsed, aggregationType)
{
	//LOG
	const combination = [chosenModelId, searchEngine, numberOfResultsUsed, aggregationType];
	console.log("Computing object detection for combination: ", combination, "... ");

	//Choose the model
	const MODEL_CONFIG = MODELS_CONFIG.find(config => config.modelId === chosenModelId);
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
			console.error("Bad model type");
			MODEL_Obj = undefined;
	}

	if(MODEL_Obj !== undefined)
	{
		//Init progress variables
		beginTime = new Date();
		totalNumberOfImages = filesSystem.readdirSync(GENERAL_CONFIG.pathToFolderActivityImages, { encoding: 'utf8', withFileTypes: true })
			.filter(dirent => dirent.isDirectory())
			.map(dirent => dirent.name)
			.reduce((total, activityFolderName) => total + filesSystem.readdirSync(`${GENERAL_CONFIG.pathToFolderActivityImages}${activityFolderName}/`, { encoding: 'utf8'}).length, 0);
		currentNumberOfImagesAnalysed = 0;
		showProgress(currentNumberOfImagesAnalysed, totalNumberOfImages, beginTime);

		//Stream of images
		const all = from(filesSystem.readdirSync(GENERAL_CONFIG.pathToFolderActivityImages, { encoding: 'utf8', withFileTypes: true }).filter(dirent => dirent.isDirectory()).map(dirent => dirent.name))
			.pipe(mergeMap(folderName => readActivityFolderByRelevance(folderName, RESULTS)));//Stream de imageObj

		//Waiting processing images...
		let [valids, invalids] = partition(all, keepValidFileImageObj);
		await Promise.all([handleValids(valids, MODEL_Obj, ...combination), handleInvalids(invalids)]);

		console.log("Analyse finie");

		//Free the memory from the model weights
		MODEL_Obj.MODEL.dispose();
	}
}

//Create Progress variables
let totalNumberOfImages;
let currentNumberOfImagesAnalysed;
let beginTime;

//Main function
/*(async function()
{
	await run(GENERAL_CONFIG.recognitionModel, GENERAL_CONFIG.searchEngine, GENERAL_CONFIG.numberOfResultsUsed, GENERAL_CONFIG.aggregationType);
})();*/
