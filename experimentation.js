import EXPERIMENTATIONS_CONFIG from './configFiles/experimentationsConfig.json'
import RUN from "./main.js"
import {mAP, mOverallAP, overallAP, rPrecision, precisionAt10} from "./performanceMetrics.js"
import filesSystem from "fs";
import groundTruth from "./configFiles/groundTruth.json"
import modelConfig from "./configFiles/modelsConfig"
import Prediction from "./entities/Prediction";
import Results from "./entities/Results";
import {getAllDataForVisualization} from "./visualizationPreprocess";
import coco_classes from "./labelFiles/coco_classes";
import yolo9000Labels from "./labelFiles/yolo9000Labels";
import imageNetLabels from "./labelFiles/imageNetLabels";

function generateCombination(criteria)
{
    if (criteria.length === 1)
    {
        return criteria[0];
    }
    else
    {
        let result = [];
        let allCasesOfRest = generateCombination(criteria.slice(1));  // recur with the rest of array
        for (let i = 0; i < allCasesOfRest.length; i++)
        {
            for (let j = 0; j < criteria[0].length; j++)
            {
                if(Array.isArray(allCasesOfRest[i]))
                {
                    result.push([criteria[0][j], ...allCasesOfRest[i]]);
                }
                else
                {
                    result.push([criteria[0][j], allCasesOfRest[i]]);
                }

            }
        }
        return result;
    }
}

let usedPerformanceMetrics =
    {
        AP: overallAP,
        recognizableObjectRate: (resultsOneQuery) => (resultsOneQuery.usedGroundTruthLength / resultsOneQuery.realGroundTruthLength),
        rPrecision: rPrecision,
        precisionAt10: precisionAt10
    };

export {usedPerformanceMetrics}

(async () =>
{
    //Generate all combinations
    const criteria = EXPERIMENTATIONS_CONFIG.criteria;
    //let combinations = generateCombination(Object.keys(criteria).map((criterionName) => criteria[criterionName]));
    let combinations = generateCombination(Object.keys(criteria).map((criterionName) => criteria[criterionName]));

    //Use every combination
    for(let i = 0; i < combinations.length; i++)
    {
        //await RUN(...combinations[i]);

        //Evaluate on combination
        //evaluateComb(combinations[i], groundTruth, 25);
        evaluateComb2(combinations[i], groundTruth);
    }

    //evaluateComb2(combinations.find(comb => comb[0] === "yolov3-608__20_0.1_0.5" && comb[1] === "duckduckgo" && comb[2] ===  100 && comb[3] === "sum"), groundTruth);

    //Get a ranking of configuration using WMAP
    const ranking = rankConfiguration();
    console.log(ranking);

    //Write json data for visualization
    const dataForVisualization = getAllDataForVisualization();
    writeJSONFile(dataForVisualization, "./configFiles/dataForVisualization.json");

})();

function rankConfiguration()
{
    //Retrieve all computed combinations
    const path = `resultFiles/`;
    const allCombinations = filesSystem.readdirSync( path, { encoding: 'utf8', withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name.split(" "));

    //Get all final results files and adding the comb name
    let allFinalResults = allCombinations
    .map(comb =>
    {
        let perf = JSON.parse(filesSystem.readFileSync( `./resultFiles/${comb.join(" ")}/finalResult.json`));
        perf.confName = comb.join(" ");
        return perf;
    })
    .map(combPerf =>
    {
        let sumROR = combPerf.performanceMetrics.reduce((sumROR, combPerfOneActivity) =>
        {
            sumROR += combPerfOneActivity.metrics.recognizableObjectRate;
            return sumROR;
        }, 0.0);

        let WMAP = combPerf.performanceMetrics.reduce((WMAP, combPerfOneActivity) =>
        {
            WMAP += combPerfOneActivity.metrics.AP * combPerfOneActivity.metrics.recognizableObjectRate / sumROR;
            return WMAP;
        }, 0.0);

        combPerf.WMAP = WMAP;

        delete combPerf.performanceMetrics;
        delete  combPerf.means;

        return combPerf;
    })
    .sort((finalRes1, finalRes2)=> finalRes2.WMAP - finalRes1.WMAP);

    writeJSONFile(allFinalResults, "./resultFiles/configurationRanking.json");

}

function evaluateComb(combination, groundTruth, k)
{
    console.log(`Evaluation of combination: ${combination} ...`);
    const path = `resultFiles/${combination.join(" ")}`;
    const filePaths = filesSystem.readdirSync( path, { encoding: 'utf8', withFileTypes: true })
        .filter(dirent => dirent.isFile() && dirent.name !== "finalResult.json")
        .map(dirent => `${path}/${dirent.name}`);

    const resultObjects = filePaths.map(filePath =>
    {
        //Get resultFile
        const resultFile = JSON.parse(filesSystem.readFileSync(filePath));

        //Get corresponding groundTruthPreds (with the use of activity name)
        const groundTruthPreds = groundTruth.find(elem => elem.query === resultFile.query).data.map( item => new Prediction(item));

        //Get corresponding realPreds
        const realPreds = JSON.parse(filesSystem.readFileSync(filePath)).data.map(item => new Prediction(item));

        //Construct our result object
        return new Results(resultFile.query, realPreds, groundTruthPreds);
    });

    //Calculate mAP
    const res = mAP(k, "trapezoidal", resultObjects, true);

    //Adding value of k
    res.k = k;

    //Write file of combination
    writeJSONFile(res, `${path}/finalResult.json`);
}

function evaluateComb2(combination, groundTruth)
{
    console.log(`Evaluation of combination: ${combination} ...`);
    //Get or create groundtruth for current model
    const pathUsedGroundTruth = `./configFiles/groundTruthModel/groundTruth__${combination[0]}.json`;
    if(!filesSystem.existsSync(pathUsedGroundTruth))
    {
        let modelOneConfig = modelConfig.find(conf => conf.modelId === combination[0]);

        let labels;
        switch (modelOneConfig.labelFile)
        {
            case "coco_classes":
                labels = coco_classes;
                break;
            case "yolo9000Labels":
                labels = yolo9000Labels;
                break;
            case "imageNetLabels":
                labels = imageNetLabels;
                break;
            default:
                labels = [];
        }

        //Create a new ground truth wich is a deep copy
        let newGroundTruth =  groundTruth.map(activityGroundTruth => ({query: activityGroundTruth.query, data: activityGroundTruth.data.filter((elem) => labels.indexOf(elem.label) !== -1)}));

        writeJSONFile(newGroundTruth, pathUsedGroundTruth);
    }
    //Get good groundTruth
    let usedGroundTruth = JSON.parse(filesSystem.readFileSync(pathUsedGroundTruth));

    //Get final results
    const path = `resultFiles/${combination.join(" ")}`;
    const filePaths = filesSystem.readdirSync( path, { encoding: 'utf8', withFileTypes: true })
        .filter(dirent => dirent.isFile() && dirent.name !== "finalResult.json")
        .map(dirent => `${path}/${dirent.name}`);

    const resultObjects = filePaths.map(filePath =>
    {
        //Get resultFile
        const resultFile = JSON.parse(filesSystem.readFileSync(filePath));

        //Get corresponding usedGroundTruthPreds (with the use of activity name)
        const usedGroundTruthPreds = usedGroundTruth.find(elem => elem.query === resultFile.query).data.map( item => new Prediction(item));
        //Get corresponding groundTruthPreds (with the use of activity name)
        const realGroundTruthPreds = groundTruth.find(elem => elem.query === resultFile.query).data.map( item => new Prediction(item));

        //Get corresponding realPreds
        const realPreds = JSON.parse(filesSystem.readFileSync(filePath)).data.map(item => new Prediction(item));

        //Construct our result object
        return new Results(resultFile.query, realPreds, usedGroundTruthPreds, realGroundTruthPreds);
    });

    //Calculate performances metrics
    const metricsJSON = computePerformanceMetricsAllActivities(resultObjects);

    //Write file of combination
    writeJSONFile(metricsJSON, `${path}/finalResult.json`);
}

function computePerformanceMetricsAllActivities(resultObjects)
{
    let performanceMetrics = resultObjects.map(resultsOneQuery =>
        {
            //Copy object
            let metrics = {...usedPerformanceMetrics};
            Object.keys(metrics).forEach(key =>
            {
                metrics[key] = metrics[key](resultsOneQuery);
            });
            return {
                query: resultsOneQuery.query,
                metrics: metrics
            }
        }
    );

    //For each perf metric, compute the mean
    let perfNames = Object.keys(performanceMetrics[0].metrics);
    let means = {};
    perfNames.forEach(name =>
    {
        let noNull = performanceMetrics.filter(obj => obj.metrics[name] !== null);

        means[`mean_${name}`] = noNull.map(obj => obj.metrics[name]).reduce((sum, curr) => sum + curr, 0) / noNull.length;
    });

    return {performanceMetrics: performanceMetrics, means: means};
}

function writeJSONFile(data, path)
{
    filesSystem.writeFileSync(path, JSON.stringify(data, null, 4), "utf8");
}