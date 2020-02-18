import filesSystem from "fs";
const colorCodes = ["#CC0000", "#FF6633", "#FFFF00", "#00CC00", "#009999", "#0099FF", "#0000FF", "#9900CC", "#FF6633", "#FF0099"];

function hex2rgba(hex, alpha = 1)
{
    const [r, g, b] = hex.match(/\w\w/g).map(x => parseInt(x, 16));
    return `rgba(${r},${g},${b},${alpha})`;
}

export function getAllDataForVisualization()
{
    //Retrieve all computed combinations
    const path = `resultFiles/`;
    const allCombinations = filesSystem.readdirSync( path, { encoding: 'utf8', withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name.split(" "));

    //Separation per searchEngine
    const perSearchEngine = classCombinationPerCriterionIndex(1, allCombinations);

    //Separation per recognitionModel
    const perRecognitionModel = classCombinationPerCriterionIndex(0, allCombinations);

    //Separation per numberOfResultsUsed
    const perNumberOfResultsUsed = classCombinationPerCriterionIndex(2, allCombinations);

    //Separation per combination to analyse each activity
    let perCombination = allCombinations.map(comb => generateChartConfigFromOneCombination(comb));


    return ({
        searchEngine: generateChartConfigFromOneCriterion(1, perSearchEngine),
        recognitionModel: generateChartConfigFromOneCriterion(0, perRecognitionModel),
        numberOfResultsUsed: generateChartConfigFromOneCriterion(2, perNumberOfResultsUsed),
        searchEngineGlobal: generateChartConfigFromOneCriterionGlobal(1, perSearchEngine),
        recognitionModelGlobal: generateChartConfigFromOneCriterionGlobal(0, perRecognitionModel),
        numberOfResultsUsedGlobal: generateChartConfigFromOneCriterionGlobal(2, perNumberOfResultsUsed),
        perCombination: perCombination
    });
}

//Classify combination by criterion and deleting the criterion at the specified index from the combinations
function classCombinationPerCriterionIndex(criterionIndex, allCombinations)
{
    return allCombinations.reduce((total, combination) =>
    {
        if(combination[criterionIndex] in total)
        {
            total[combination[criterionIndex]].push(combination.filter((elem, index) => index !== criterionIndex));
        }
        else
        {
            total[combination[criterionIndex]] = [combination.filter((elem, index) => index !== criterionIndex)];
        }
        return total;
    }, {});
}

//Return an array of data sets
function generateChartConfigFromOneCriterion(criterionIndex, classedCombinations)
{
    //Find longest array
    const orderedLabels = Object
        .keys(classedCombinations)
        .map(key => classedCombinations[key])
        .reduce((a, b) => (a.length > b.length ? a : b ))
        .map(comb => comb.join(" "))
        .sort((a,b) => a.localeCompare(b));

    //Computing data
    const allMAPPerCriterionValue = Object.keys(classedCombinations)
        .map(key => (
            {
                criterionValue: key,
                allMAP: classedCombinations[key]
                    .map(comb =>
                        {
                            const combOld = [...comb];
                            comb.splice(criterionIndex, 0, key);
                            return (
                                {
                                    combination: combOld.join(" "),
                                    mAP: JSON.parse(filesSystem.readFileSync( `./resultFiles/${comb.join(" ")}/finalResult.json`)).mAP
                                })}
                    )
            })
        );

    const datasets = allMAPPerCriterionValue.map((obj, indexCriterionValue) =>
        ({
            label: obj.criterionValue,
            data: orderedLabels.map(label =>
            {
                const index = obj.allMAP.map(mAPObj => mAPObj.combination).indexOf(label);
                return (index !== -1 ? obj.allMAP[index].mAP : undefined);
            }),
            yAxisID: "perf",
            backgroundColor: colorCodes[indexCriterionValue]
        })
    );
    const data = {datasets: datasets};

    //Final config object
    return {
        type: 'bar',
        data: data,
        options:
            {
                responsive: true,
                legend: {position: 'top'},
                title:
                    {
                        display: true,
                        text: 'Performances computed by used config'
                    },
                scales:
                    {
                        yAxes:
                            [
                                {
                                    label:"Performance",
                                    id: 'perf',
                                    type: 'linear',
                                    position: 'left',
                                    scaleLabel: {
                                        labelString: "Performance",
                                        display: true,
                                        fontSize: 16,
                                        fontColor: "#666",
                                        fontStyle: "bold"
                                    }
                                }],
                        xAxes:
                            [
                                {
                                    type: 'category',
                                    labels: orderedLabels,
                                    label: "Combinations",
                                    scaleLabel:
                                        {
                                            labelString: "Combinations",
                                            display: true,
                                            fontSize: 16,
                                            fontColor: "#666",
                                            fontStyle: "bold"
                                        }
                                }
                            ]
                    },
                plugins: {}
            }
    };
}

function generateChartConfigFromOneCriterionGlobal(criterionIndex, classedCombinations)
{
    //Find longest array
    const orderedLabels = Object
        .keys(classedCombinations);

    //Computing data
    const mMAPPerCriterionValue = Object.keys(classedCombinations)
        .map(key =>
            {
                const allMAP = classedCombinations[key].map(comb => JSON.parse(filesSystem.readFileSync( `./resultFiles/${comb.join(" ")}/finalResult.json`)).mAP);
                const mMAP = allMAP.reduce((sum, curr) => sum + curr, 0) / allMAP.length;
                const sdMAP = Math.sqrt(allMAP.reduce((sum, curr) => sum + Math.pow(curr - mMAP, 2), 0) / allMAP.length);

                return ({criterionValue: key, mMAP: mMAP, sdMAP: sdMAP});
            }
        );


    let errorBars = {};
    mMAPPerCriterionValue.forEach(obj =>
    {
        errorBars[obj.criterionValue] = {plus: obj.sdMAP, minus: - obj.sdMAP};
    });

    const datasets = [
        {
            label: "Criterion",
            borderWidth: 1,
            data: mMAPPerCriterionValue.map(obj => ({x: obj.criterionValue, y: obj.mMAP, sdMAP: obj.sdMAP})),
            errorBars: errorBars,
            yAxisID: "y-axis-0",
            backgroundColor: hex2rgba(colorCodes[0], 0.5),
            borderColor: colorCodes[0]
        }
    ];

    const data = {labels: orderedLabels, datasets: datasets};

    //Final config object
    return {
        type: 'bar',
        data: data,
        options:
            {
                responsive: true,
                legend: {position: 'top'},
                title: {display: true, text: 'Performances computed by used config'},
                scales:
                    {
                        yAxes:
                            [
                                {
                                    label:"Performances",
                                    id: 'y-axis-0',
                                    type: 'linear',
                                    position: 'left',
                                    scaleLabel: {
                                        labelString: "Performances",
                                        display: true,
                                        fontSize: 16,
                                        fontColor: "#666",
                                        fontStyle: "bold"
                                    },
                                    ticks: { beginAtZero: true }
                                }],
                        xAxes:
                            [
                                {
                                    type: 'category',
                                    labels: orderedLabels,
                                    label: "Combinations",
                                    scaleLabel:
                                        {
                                            labelString: "Combinations",
                                            display: true,
                                            fontSize: 16,
                                            fontColor: "#666",
                                            fontStyle: "bold"
                                        }
                                }
                            ]
                    },
                plugins:
                    {
                        chartJsPluginErrorBars:
                            {
                                width: "20px",
                                lineWidth: "2px",
                                absoluteValues: false
                            }
                    },
                tooltips:
                    {
                        mode: 'index',
                        axis: 'y',
                        callbacks: {
                            // Use the footer callback to display the result of a function
                            label: "callbackGlobal"
                        },
                        footerFontStyle: 'normal'
                    }


            }
    };
}

function generateChartConfigFromOneCombination(combination)
{
    const finalResultJson = JSON.parse(filesSystem.readFileSync( `./resultFiles/${combination.join(" ")}/finalResult.json`));

    const datasets = [
        {
            label: `Performance per activity with the config ${combination.join(" ")}`,
            borderWidth: 1,
            data: finalResultJson.APs.map(obj => ({x: obj.query, y: obj.AP, recognizableObjectRate: obj.recognizableObjectRate})),
            yAxisID: "y-axis-0",
            backgroundColor: hex2rgba(colorCodes[0], 0.5),
            borderColor: colorCodes[0]
        }
    ];

    const data = {labels: finalResultJson.APs.map(obj => obj.query), datasets: datasets};

    //Final config object
    const config = {
        type: 'bar',
        data: data,
        options:
            {
                responsive: true,
                legend: {position: 'top'},
                title: {display: true, text: 'Performances computed by activity'},
                scales:
                    {
                        yAxes:
                            [
                                {
                                    label:"Performances",
                                    id: 'y-axis-0',
                                    type: 'linear',
                                    position: 'left',
                                    scaleLabel: {
                                        labelString: "Performances",
                                        display: true,
                                        fontSize: 16,
                                        fontColor: "#666",
                                        fontStyle: "bold"
                                    },
                                    ticks: { beginAtZero: true }
                                }],
                        xAxes:
                            [
                                {
                                    type: 'category',
                                    labels: finalResultJson.APs.map(obj => obj.query),
                                    label: "Activities",
                                    scaleLabel:
                                        {
                                            labelString: "Activities",
                                            display: true,
                                            fontSize: 16,
                                            fontColor: "#666",
                                            fontStyle: "bold"
                                        }
                                }
                            ]
                    },
                tooltips:
                    {
                        mode: 'index',
                        axis: 'y',
                        callbacks: {
                            // Use the footer callback to display the result of a function
                            label: "callbackCombination"
                        },
                        footerFontStyle: 'normal'
                    }
            }
    };

    //Result
    return {combination: combination.join(" "), config}
}

/*const dataForVisualization = getAllDataForVisualization();
writeJSONFile(dataForVisualization, "./configFiles/dataForVisualization.json");*/
