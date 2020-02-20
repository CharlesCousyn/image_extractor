import filesSystem from "fs";
const colorCodes = ["#CC0000", "#FF6633", "#FFFF00", "#00CC00", "#009999", "#0099FF", "#0000FF", "#9900CC", "#FF6633", "#FF0099"];
import {usedPerformanceMetrics} from "./experimentation";

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
        metricsNames: Object.keys(usedPerformanceMetrics),
        perCriterion:
        [
            {
                criterion: "searchEngine",
                config: generateChartConfigFromOneCriterion(1, perSearchEngine)
            },
            {
                criterion: "recognitionModel",
                config: generateChartConfigFromOneCriterion(0, perRecognitionModel)
            },
            {
                criterion: "numberOfResultsUsed",
                config: generateChartConfigFromOneCriterion(2, perNumberOfResultsUsed)
            },
            {
                criterion: "searchEngineGlobal",
                config: generateChartConfigFromOneCriterionGlobal(1, perSearchEngine)
            },
            {
                criterion: "recognitionModelGlobal",
                config: generateChartConfigFromOneCriterionGlobal(0, perRecognitionModel)
            },
            {
                criterion: "numberOfResultsUsedGlobal",
                config: generateChartConfigFromOneCriterionGlobal(2, perNumberOfResultsUsed)
            }
        ],
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
    let meanNames=[];
    let dataObj = {};
    Object.keys(classedCombinations)
        .forEach(key =>
            {
                const allMeansCombs = classedCombinations[key].map(comb =>
                {
                    const combOld = [...comb];
                    comb.splice(criterionIndex, 0, key);
                    let means = JSON.parse(filesSystem.readFileSync( `./resultFiles/${comb.join(" ")}/finalResult.json`)).means;
                    let obj = {x: combOld.join(" ")};

                    Object.keys(means).forEach((meanName, indexName) =>
                    {
                        if(indexName === 0)
                        {
                            obj.y = means[meanName];
                        }
                        obj[meanName] = means[meanName];
                    });
                    return obj;
                });

                dataObj[key] = allMeansCombs;
            }
        );


    const datasets = Object.keys(dataObj).map((criterionValue, indexCriterionValue) =>
        ({
            label: criterionValue,
            data: dataObj[criterionValue],
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
    let meanNames=[];
    const meanMeansPerCriterionValue = Object.keys(classedCombinations)
        .map(key =>
            {
                const allMeansCombs = classedCombinations[key].map(comb => JSON.parse(filesSystem.readFileSync( `./resultFiles/${comb.join(" ")}/finalResult.json`)).means);
                meanNames = Object.keys(allMeansCombs[0]);
                let obj = {criterionValue: key};

                meanNames.forEach(name =>
                {
                    const meanMeans = allMeansCombs.reduce((sum, curr) => sum + curr[name], 0) / allMeansCombs.length;
                    const standardDeviationMeans = Math.sqrt(allMeansCombs.reduce((sum, curr) => sum + Math.pow(curr[name] - meanMeans, 2), 0) / allMeansCombs.length);
                    obj[`mean_${name}`] = meanMeans;
                    obj[`standardDeviation_${name}`] = standardDeviationMeans;
                });
                return obj;
            }
        );

    //Create errors bars
    let allErrorBars = {};
    meanNames.forEach(name =>
    {
        let errorBars = {};
        meanMeansPerCriterionValue.forEach(obj =>
        {
            errorBars[obj.criterionValue] = {plus: obj[`standardDeviation_${name}`], minus: - obj[`standardDeviation_${name}`]};
        });
        allErrorBars[name] = errorBars;
    });

    //Create data in dataset
    let dataInDataset = meanMeansPerCriterionValue.map(obj =>
    {
        let res = {x: obj.criterionValue};
        Object.keys(obj).forEach((name, index) =>
        {
            if(index === 1)
            {
                res.y = obj[name];
            }
            res[name] = obj[name];
        });
        return res;
    });

    const datasets = [
        {
            label: "Criterion",
            borderWidth: 1,
            data: dataInDataset,
            errorBars: Object.keys(allErrorBars).map(key => allErrorBars[key])[0],
            yAxisID: "y-axis-0",
            backgroundColor: hex2rgba(colorCodes[0], 0.5),
            borderColor: colorCodes[0],
            allErrorBars: allErrorBars
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

    let dataInDataset = finalResultJson.performanceMetrics.map(obj =>
    {
        let res = {x: obj.query};
        Object.keys(obj.metrics).forEach((name, index) =>
        {
            if(index === 0)
            {
                res.y = obj.metrics[name];
            }
            res[name] = obj.metrics[name];
        });
        return res;
    });


    const datasets = [
        {
            label: `Performance per activity with the config ${combination.join(" ")}`,
            borderWidth: 1,
            data: dataInDataset,
            yAxisID: "y-axis-0",
            backgroundColor: hex2rgba(colorCodes[0], 0.5),
            borderColor: colorCodes[0]
        }
    ];

    const data = {labels: finalResultJson.performanceMetrics.map(obj => obj.query), datasets: datasets};

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
                                    labels: finalResultJson.performanceMetrics.map(obj => obj.query),
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
