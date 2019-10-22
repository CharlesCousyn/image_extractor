import * as tensorflow from '@tensorflow/tfjs-node-gpu'
import sharp from 'sharp'
import filesSystem from 'fs'
import { from, of } from 'rxjs'
import { filter, map, concatMap, tap, groupBy, reduce, mergeMap, mergeAll, toArray, take, bufferCount } from 'rxjs/operators'
import arrayOfLabels from './configFiles/imageNetLabels.json'
import MODELS_CONFIG from './configFiles/modelsConfig.json'

//const isPicture = /^.*\.(jpg|png|gif|bmp|jpeg)/i;
const isPicture = /^.*\.(jpg|png|gif|jpeg)/i;

const BATCH_FILE_SIZE_LIMIT = 5242880; //Doesn't work with const BUFFER_COUNT = 17;

const BUFFER_COUNT = 5;
const NUMBER_OF_BEST_PREDICTIONS = 25;

const WIDTH_REQUIRED = 331;
const HEIGHT_REQUIRED = 331;

//Choose the model
const MODEL_CONFIG = MODELS_CONFIG.find(config => config.name === "mobilenet_v2_140_224");

//TODO: Accept images from multiple activities
//TODO: Accept models of classification and object detection
//TODO: Accept mulitple ways of aggregation

function keepValidFile(name)
{
	return isPicture.test(name);
}

function keepLittleFile(fileObj)
{
	return fileObj.size < BATCH_FILE_SIZE_LIMIT;
}

//file as {path, size}
//5.5mo max !!
function addSizeInformation(path)
{
	return {path: path, size: filesSystem.statSync(path).size};
}

async function resizeAndSaveImageIfBadDimensions(imagePath)
{
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

	return imagePath;
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

function writeJSONFile(data, path)
{
	filesSystem.writeFileSync(path, JSON.stringify(data, null, 4), "utf8");
}

function run (MODEL)
{
	function classify (pictures)
	{
		//Doing a prediction
		const predictions = MODEL.predict(pictures);

		//Free the memory of the tensor pictures
		tensorflow.dispose(pictures);

		//Transform predictions to be readable
		return from(predictions.arraySync().map(prediction => from(prediction.map((value, index) => [arrayOfLabels[index], value]))));
	}

	from(filesSystem.readdirSync('./data', { encoding: 'utf8' }))
		//Stream de paths (string)
		.pipe(groupBy(keepValidFile))
		.pipe(mergeMap(group =>
		{
			//Valid files
			if(group.key)
			{
				return group
				.pipe(map(x => `./data/${x}`))
				//Stream de paths (string)
				.pipe(mergeMap(path => from(resizeAndSaveImageIfBadDimensions(path))))
				//Stream de paths (string)
				.pipe(map(addSizeInformation))
				//Stream d'objet ({path, size})
				.pipe(filter(keepLittleFile))
				//Stream d'objet ({path, size})
				.pipe(bufferCount(BUFFER_COUNT))
				//Stream d'arrays d'objet ({path, size})
				.pipe(concatMap(someFiles =>
				{
					return from(someFiles)
					.pipe(mergeMap(file => load(file.path)))
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
					.pipe(map(bigTensor => classify(bigTensor)));
					//Stream de Stream de prédictions
				}))
				//Stream de Stream de Stream de prédictions
				.pipe(mergeAll())
				//Stream de Stream de Predictions
				.pipe(mergeAll())
				//Stream de Prediction individuelles ici: [ 'pineapple', -0.3546293079853058 ]
				.pipe(groupBy(x => x[0], x => x[1]))
				//Stream de GroupedObservable de prédictions groupées par classes
				.pipe(mergeMap( (group) => group
					.pipe(reduce((a, b) => a + b))
					.pipe(map(x => [group.key, x]))
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
				.pipe(tap(console.log))
				.pipe(toArray())
				.pipe(map(array => writeJSONFile(array, "./resultFiles/results.json")));
			}
			//not valid files
			else
			{
				return group
				.pipe(toArray())
				.pipe(tap(x => console.log("Bad images paths: ", x)))
				.pipe(map(badImagesPaths => writeJSONFile(badImagesPaths, "./resultFiles/badImagesPaths.json")));
			}
		}))
		.pipe(toArray())
		.subscribe(x =>
		{
			console.log("Analyse finie");
			MODEL.dispose();
		});
}

tensorflow.loadGraphModel(`file://models/${MODEL_CONFIG.name}/model.json`).then(run);
