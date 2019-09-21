import * as tensorflow from '@tensorflow/tfjs-node-gpu'
import filesSystem from 'fs'
import { from, of } from 'rxjs'
import { filter, map, flatMap, concatAll, bufferCount, groupBy, reduce, mergeMap, toArray, take } from 'rxjs/operators'
import arrayOfLabels from './ImageNetLabels.json'

const isPicture = /^.*\.(jpg|png|gif|bmp|jpeg)/i;
const BATCH_SIZE = 1;

function keepValidFile (name)
{
	return isPicture.test(name);
}

function load (path)
{
	const pictures = tensorflow.image.resizeNearestNeighbor(
		tensorflow.div(
			tensorflow.node.decodeImage(new Uint8Array(filesSystem.readFileSync(path)), 3),
			tensorflow.scalar(255, 'float32')
		),[331, 331]
	);

	if (pictures.shape.length === 4)
	{
		return from(tensorflow.split(pictures, pictures.shape[0], 0));
	}
	else
	{
		return of(pictures.reshape([1, ...pictures.shape]));
	}
}

function run (MODEL)
{
	async function classify (pictures)
	{
		const predictions = await MODEL.predict(pictures);
		return  from((await predictions.array()).map(prediction => from(prediction.map((value, index) => [arrayOfLabels[index], value]))));
	}

	from(filesSystem.readdirSync('./data', { encoding: 'utf8' }))
		.pipe(
			filter(keepValidFile),
			map(x => `./data/${x}`),
			map(load),
			concatAll(),
			bufferCount(BATCH_SIZE),
			map(x => tensorflow.concat(x, 0)),
			flatMap(classify),
			concatAll(),
			concatAll(),
			groupBy(x => x[0], x => x[1]),
			mergeMap(function (group) {
				return group.pipe(reduce((a, b) => a + b))
				.pipe(map(x => [group.key, x]))
			}),
			toArray(),
			map(x => from(x.sort((a, b) => b[1] - a[1]))),
			concatAll(),
			take(25))
		.subscribe(console.log);
}

//const MODEL_PATH = 'file://models/mobilenet1/model.json'
//const MODEL_PATH = 'file://models/mobilenet2/model.json'
const MODEL_PATH = 'file://models/pnasnet/model.json';
//const MODEL_PATH = 'file://models/inception_resnetv2/model.json';
//const MODEL_PATH = 'file://models/mobilenet1_v2/model.json'

tensorflow.loadGraphModel(MODEL_PATH).then(run);
