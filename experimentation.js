import EXPERIMENTATIONS_CONFIG from './configFiles/experimentationsConfig.json'
import RUN from "./main.js"
import mAP from "./performanceMetrics.js"

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
    let combinations = generateCombination(Object.keys(criteria).map((criterionName) => criteria[criterionName]));

    //Use every combination
    for(let i = 0; i < combinations.length; i++)
    {
        await RUN(...combinations[i]);

        //Evaluate on combination


    }

})();

function evaluateComb(combination)
{

}
