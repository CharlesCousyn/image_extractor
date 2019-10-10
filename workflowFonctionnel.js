import filesSystem from "fs";


from(filesSystem.readdirSync('./data', { encoding: 'utf8' }))
//Stream de paths (string)
.pipe(filter(keepValidFile))
//Stream de paths (string)
.pipe(map(x => `./data/${x}`))
//Stream de paths (string)
.pipe(map(addSizeInformation))
//Stream d'objet ({path, size})
.pipe(filter(keepLittleFile))
//Stream d'objet ({path, size})
.pipe(map(addAccSizeInformation))
//Stream d'objet ({path, size, accSize})
.pipe(groupBy(x => Math.round(x.accSize / BATCH_FILE_SIZE_LIMIT), x => x.path))
//Stream de GroupedObservable de path
.pipe(mergeMap(group => group.pipe(reduce((acc, cur) => [...acc, cur], []))))
//Stream d'array de path (string)
.pipe(concatMap(groupFiles =>
{
	console.log("New Group");
	console.log(groupFiles);

	return from(groupFiles)
	//Stream de paths (string)
	.pipe(map(filePath => load(filePath)))
	//Stream de Stream de tenseurs (images chargées)
	.pipe(mergeMap(someTensors => someTensors.pipe(reduce((acc, cur) => [...acc, cur], []))))
	//Stream d'array de tenseurs
	.pipe(map(someTensors => tensorflow.concat(someTensors, 0)))
	//Stream de tenseurs
	.pipe(mergeMap(classify));
	//Stream de Stream de Stream prédictions

}))
//Stream de Stream de Stream de Predictions
.pipe(concatAll())
//Stream de Stream de Predictions
.pipe(mergeAll())
//Stream de Prediction individuelles ici: [ 'pineapple', -0.3546293079853058 ]
.pipe(map(p => {
	//console.log("predictions: ", p);
	return p;
}))
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
.subscribe(console.log);