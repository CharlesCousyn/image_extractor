import Results from "./entities/Results.js";

/**
 * @param {Number} TP - Number of true positives
 * @param {Number} NumberPredicted - Total number of predictions
 * @returns {Number} recall - Return the recall
 */
function precision(TP, NumberPredicted)
{
    return TP / NumberPredicted;
}

/**
 * @param {Number} TP - Number of true positives
 * @param {Number} NumberPositives - Total number of positives
 * @returns {Number} recall - Return the recall
 */
function recall(TP, NumberPositives)
{
    return TP / NumberPositives;
}

/**
 * @param {Number} k - Rank used to compute
 * @param {String} aucRule - AUC computation method
 * @param {Results} results - Results for one query
 * @returns {Number} AP
 */
function AP(k, aucRule, results)
{
    //Get all the positive label to compare
    let allPositivesLabels = results.data.map(line => line[1]).filter(pred => pred.correct).map(pred => pred.label);

    //Adding correctness column (Are the label predicted in groundtruth and correct?)
    results.data = results.data.map(line => [...line, allPositivesLabels.indexOf(line[0].label) !== -1]);

    //Min number of positive label knowing k
    let kOrLength = Math.min(k, allPositivesLabels.length);

    //Adding precision and recall columns
    let countTP = 0;
    results.data = results.data.map((line, index) =>
    {
        if(line[2])
        {
            countTP++;
        }
        return [...line, precision(countTP, index + 1), recall(countTP, kOrLength)]
    });

    //Adding first point (interpolation)
    results.data = [[undefined, undefined, undefined, 1, 0], ...results.data];

    let aucComputationFonction;
    switch(aucRule)
    {
        case "trapezoidal":
            aucComputationFonction =
                function(line, index, array)
                {
                    if(array.length - 1 <= index)
                    {
                        return 0;
                    }
                    return (array[index + 1][4] - line[4]) * (line[3] + array[index + 1][3]) / 2;
                };
            break;
        case "rectangular":
            aucComputationFonction =
                function(line, index, array)
                {
                    if(array.length - 1 <= index)
                    {
                        return 0;
                    }
                    return (array[index + 1][4] - line[4]) * array[index + 1][3];
                };
            break;
        default:
            aucComputationFonction = () => 0;
    }

    return results.data.map(aucComputationFonction).reduce((sum, curr, index) => (index < k ? sum + curr : sum), 0);
}

/**
 * @param {Number} k - Rank used to compute
 * @param {String} aucRule - AUC computation method
 * @param {Results[]} results - Array of results for multiple queries
 * @returns {Number} mAP - Return mean of Average precision by query
 */
function mAP(k, aucRule, results)
{
    let APs = results.map(resultsOneQuery => AP(k, aucRule, resultsOneQuery));
    return APs.reduce((sum, curr) => sum + curr, 0) / APs.length;
}

export default mAP;