import EXPERIMENTATIONS_CONFIG from './configFiles/experimentationsConfig.json'
import RUN from "./main.js"
import {mAP, mOverallAP} from "./performanceMetrics.js"
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

(async () =>
{
    //Generate all combinations
    const criteria = EXPERIMENTATIONS_CONFIG.criteria;
    //let combinations = generateCombination(Object.keys(criteria).map((criterionName) => criteria[criterionName]));
    let combinations = generateCombination(Object.keys(criteria).map((criterionName) => criteria[criterionName]));
    //combinations = [[ 'yolo9000__20_0.05_0.5', 'google', 200, 'sum' ]];

    //Use every combination
    for(let i = 0; i < combinations.length; i++)
    {
        await RUN(...combinations[i]);

        //Evaluate on combination
        //evaluateComb(combinations[i], groundTruth, 25);
        evaluateComb2(combinations[i], groundTruth);
    }

    //evaluateComb2(combinations.find(comb => comb[0] === "yolov3-608__20_0.1_0.5" && comb[1] === "duckduckgo" && comb[2] ===  100 && comb[3] === "sum"), groundTruth, 25);

    //Write json data for visualization
    const dataForVisualization = getAllDataForVisualization();
    writeJSONFile(dataForVisualization, "./configFiles/dataForVisualization.json");

})();

function evaluateComb(combination, groundTruth, k)
{
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
    //Get or create groundtruth for current model
    const pathRealGroundTruth = `./configFiles/groundTruthModel/groundTruth__${combination[0]}.json`;
    if(!filesSystem.existsSync(pathRealGroundTruth))
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

        //Create
        let newGroundTruth =  groundTruth.map(activityGroundTruth =>
        {
            activityGroundTruth.data = activityGroundTruth.data.filter((elem) => labels.indexOf(elem.label) !== -1);
            return activityGroundTruth;
        });

        writeJSONFile(newGroundTruth, pathRealGroundTruth);
    }
    //Get good groundTruth
    let usedGroundTruth = JSON.parse(filesSystem.readFileSync(pathRealGroundTruth));

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

    //Calculate mAP
    const res = mOverallAP(resultObjects, true, true);

    //Write file of combination
    writeJSONFile(res, `${path}/finalResult.json`);
}

function writeJSONFile(data, path)
{
    filesSystem.writeFileSync(path, JSON.stringify(data, null, 4), "utf8");
}