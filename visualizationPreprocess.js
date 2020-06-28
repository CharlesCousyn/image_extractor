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
            },
            {
                criterion: "granularity",
                config: generateChartConfigFromGranularity(allCombinations)
            },
            {
                criterion: "activityGlobal",
                config: generateChartConfigFromActivityGlobal(allCombinations)
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

function generateChartConfigFromGranularity(combinations)
{
    //Computing data
    let dataInDataset = [];

    let allFinalResults = combinations.map(comb =>
        JSON.parse(filesSystem.readFileSync( `./resultFiles/${comb.join(" ")}/finalResult.json`)).performanceMetrics);

    allFinalResults = allFinalResults.map(fr =>
    {
        let [generic, specific] = fr.reduce((res, perf) =>
        {
            if(perf.query === "bake_parmesan_turkey_meatballs" ||
                perf.query === "make_low_carb_pancakes" ||
                perf.query === "make_mashed_potato_casserole" ||
                perf.query === "make_stuffed_crust_pizza")
            {
                res[1].push(perf);
            }
            else
            {
                res[0].push(perf);
            }
            return res;
        }, [[], []]);

        return {generic, specific}
    });

    let orderedLabels = ["generic", "specific"];
    let metricNames = Object.keys(allFinalResults[0].generic[0].metrics);

    //Create init objects for reduce
    let initObjectLittle = {};
    metricNames.forEach((metricName) =>
        {
            initObjectLittle[`mean_${metricName}`] = 0.0;
        }
    );

    //Create init objects for reduce
    let initObjectBigMean = {};
    metricNames.forEach((metricName) =>
        {
            initObjectBigMean[`mean_mean_${metricName}`] = 0.0;
        }
    );

    let initObjectBigSD = {};
    metricNames.forEach((metricName) =>
        {
            initObjectBigSD[`standardDeviation_mean_${metricName}`] = 0.0;
        }
    );

    //Copy init objects
    let initObject1 = {...initObjectBigMean};
    let initObject2 = {...initObjectBigMean};
    let initObject11 = {...initObjectBigSD};
    let initObject21 = {...initObjectBigSD};

    //Compute means and standard deviations

    //Return means for each comb: [[meanGenComb1, meanSpecComb1], [meanGenComb2, meanSpecComb2], ...]
    let tabMeansForAllComb = allFinalResults.map(
        (combPerf, index1, arrayBig) =>
        {
            let initObject3 = {...initObjectLittle};
            let initObject4 = {...initObjectLittle};

            //Compute mean generic for one comb
            let meanGenericOneComb = combPerf.generic.reduce((moyOneComb, perf, index, array) =>
            {
                metricNames.forEach(name =>
                {
                    moyOneComb[`mean_${name}`] += perf.metrics[name] / array.length;
                });
                return moyOneComb;
            }, initObject3);

            //Compute mean specific for one comb
            let meanSpecificOneComb = combPerf.specific.reduce((moyOneComb, perf, index, array) =>
            {
                metricNames.forEach(name =>
                {
                    moyOneComb[`mean_${name}`] += perf.metrics[name] / array.length;
                });
                return moyOneComb;
            }, initObject4);

            return [meanGenericOneComb, meanSpecificOneComb];
        });

    //Return means for all comb: [meanGen, meanSpec]
    let [genericMean, specificMean] = tabMeansForAllComb.reduce(
        (meanMean, currMean, index, arrayBig)=>
    {
        //Compute mean for all comb incrementally
        metricNames.forEach(name =>
        {
            meanMean[0][`mean_mean_${name}`] += currMean[0][`mean_${name}`] / arrayBig.length;
            meanMean[1][`mean_mean_${name}`] += currMean[1][`mean_${name}`] / arrayBig.length;
        });

        return meanMean;
    }, [initObject1, initObject2]);

    //Return standard deviation for all comb: [standardDeviationGen, standardDeviationSpec]
    let [genericSD, specificSD] = tabMeansForAllComb
    .reduce((SDMean, currMean, index, arrayBig) =>
        {
            //Compute mean for all comb incrementally
            metricNames.forEach(name =>
            {
                SDMean[0][`standardDeviation_mean_${name}`] += Math.pow(currMean[0][`mean_${name}`] - genericMean[`mean_mean_${name}`], 2)/ arrayBig.length;
                SDMean[1][`standardDeviation_mean_${name}`] += Math.pow(currMean[0][`mean_${name}`] - specificMean[`mean_mean_${name}`], 2) / arrayBig.length;
            });

            return SDMean;
        }, [initObject11, initObject21])
    .map(perfObj =>
    {
        Object.keys(perfObj).forEach(metricName =>
        {
            perfObj[metricName] = Math.sqrt(perfObj[metricName]);
        });
        return perfObj;
    });

    //Fusion mean and SD
    let genericPerf = {...genericMean, ...genericSD};
    let specificPerf = {...specificMean, ...specificSD};

    dataInDataset = [
        {x: "generic", y: genericPerf[Object.keys(genericPerf)[0]], ...genericPerf}
    ,{x: "specific", y: specificPerf[Object.keys(specificPerf)[0]], ...specificPerf}];

    //Create errors bars
    let allErrorBars = {};
    metricNames.forEach(name =>
    {
        let errorBars = {};
        errorBars["generic"] = {plus: genericSD[`standardDeviation_mean_${name}`], minus: - genericSD[`standardDeviation_mean_${name}`]};
        errorBars["specific"] = {plus: specificSD[`standardDeviation_mean_${name}`], minus: - specificSD[`standardDeviation_mean_${name}`]};

        allErrorBars[name] = errorBars;
    });

    const datasets = [{
            label: "granularity",
            borderWidth: 1,
            data: dataInDataset,
            errorBars: Object.keys(allErrorBars).map(key => allErrorBars[key])[0],
            yAxisID: "y-axis-0",
            backgroundColor: hex2rgba(colorCodes[0], 0.5),
            borderColor: colorCodes[0],
            allErrorBars: allErrorBars
        }];
    const data = {labels: orderedLabels, datasets: datasets};

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
                                    id: 'y-axis-0',
                                    type: 'linear',
                                    position: 'left',
                                    scaleLabel: {
                                        labelString: "Performance",
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
                            label: "callback"
                        },
                        footerFontStyle: 'normal'
                    }
            }
    };
}

function generateChartConfigFromActivityGlobal(combinations)
{
    //Computing data
    let dataInDataset = [];

    let allFinalResults = combinations.map(comb =>
        JSON.parse(filesSystem.readFileSync( `./resultFiles/${comb.join(" ")}/finalResult.json`)).performanceMetrics);

    let orderedLabels = allFinalResults[0].map(finalRes => finalRes.query);
    let metricNames = Object.keys(allFinalResults[0][0].metrics);

    //Create init objects for reduce
    let initObject = [];
    orderedLabels.forEach(activity =>
    {
        initObject.push({query: activity, metrics: {}});
    });
    initObject = initObject.map(obj =>
    {
        metricNames.forEach((metricName) =>
        {
            obj.metrics[`mean_${metricName}`] = 0.0;
            obj.metrics[`standardDeviation_${metricName}`] = 0.0;
        });
        return obj;
    });

    //Return means for each activity
    let tabMeanPerActivity = allFinalResults.reduce(
        (meanEachActivityOverAllCombination, currFinalRes, index, array)=>
        {
            meanEachActivityOverAllCombination.map(meanOneActivityOverAllCombination =>
            {
                let goodActivityRes = currFinalRes.find(actRes => actRes.query === meanOneActivityOverAllCombination.query);

                metricNames.forEach((metricName) =>
                {
                    meanOneActivityOverAllCombination.metrics[`mean_${metricName}`] += goodActivityRes.metrics[metricName] / array.length;
                });
                return meanOneActivityOverAllCombination;
            });

            return meanEachActivityOverAllCombination;
        }, initObject);

    //Add standard deviation for each activity
    tabMeanPerActivity = allFinalResults
    .reduce((tabMeanAndSDPerActivity, currFinalRes, index, array)=>
        {
            tabMeanAndSDPerActivity.map(meanAndSDOneActivtyOverAllCombination =>
            {
                let goodActivityRes = currFinalRes.find(actRes => actRes.query === meanAndSDOneActivtyOverAllCombination.query);

                metricNames.forEach((metricName) =>
                {
                    meanAndSDOneActivtyOverAllCombination.metrics[`standardDeviation_${metricName}`] +=
                        Math.pow(goodActivityRes.metrics[metricName] - meanAndSDOneActivtyOverAllCombination.metrics[`mean_${metricName}`], 2) / array.length;
                });
                return meanAndSDOneActivtyOverAllCombination;
            });

            return tabMeanAndSDPerActivity;
        }, tabMeanPerActivity)
    .map(perfObj =>
    {
        metricNames.forEach((metricName) =>
        {
            perfObj.metrics[`standardDeviation_${metricName}`] = Math.sqrt(perfObj.metrics[`standardDeviation_${metricName}`]);
        });
        return perfObj;
    });

    console.log("tabMeanPerActivity", tabMeanPerActivity);

    dataInDataset = tabMeanPerActivity.map(oneActivityPerf =>
        {
            return {x:oneActivityPerf.query,
                y: oneActivityPerf.metrics[Object.keys(oneActivityPerf.metrics)[0]],
                ...oneActivityPerf.metrics};
        });

    //Create errors bars
    let allErrorBars = {};
    metricNames.forEach(name =>
    {
        let errorBars = {};
        tabMeanPerActivity.forEach(actRes =>
            {
                errorBars[actRes.query] = {plus: actRes.metrics[`standardDeviation_${name}`], minus: - actRes.metrics[`standardDeviation_${name}`]};
            }
        );
        allErrorBars[name] = errorBars;
    });


    const datasets = [{
        label: "granularity",
        borderWidth: 1,
        data: dataInDataset,
        errorBars: Object.keys(allErrorBars).map(key => allErrorBars[key])[0],
        yAxisID: "y-axis-0",
        backgroundColor: hex2rgba(colorCodes[0], 0.5),
        borderColor: colorCodes[0],
        allErrorBars: allErrorBars
    }];
    const data = {labels: orderedLabels, datasets: datasets};

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
                        text: 'Performances computed by activity name'
                    },
                scales:
                    {
                        yAxes:
                            [
                                {
                                    label:"Performance",
                                    id: 'y-axis-0',
                                    type: 'linear',
                                    position: 'left',
                                    scaleLabel: {
                                        labelString: "Performance",
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
                                    label: "Activités",
                                    scaleLabel:
                                        {
                                            labelString: "Activités",
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
                            label: "callback"
                        },
                        footerFontStyle: 'normal'
                    }
            }
    };
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
                        text: 'Performances computed by granularity'
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
                                    },
                                    ticks: { beginAtZero: true }
                                }],
                        xAxes:
                            [
                                {
                                    type: 'category',
                                    labels: ["generic", "specific"],
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
                plugins: {},
                tooltips:
                    {
                        mode: 'index',
                        axis: 'y',
                        callbacks: {
                            // Use the footer callback to display the result of a function
                            label: "callback"
                        },
                        footerFontStyle: 'normal'
                    }
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
