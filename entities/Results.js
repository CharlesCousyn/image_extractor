/** Class representing Results of a query. */
export default class Results
{
    /**
     * Create results.
     * @param {string|Object} queryOrObject - The query or object containing result
     * @param {(Prediction[])=} predictionsOneQuery - Array of predictions for one query
     * @param {(Prediction[])=} usedGroundTruthOneQuery - Array of ground truths predictions for one query using the specific groundTruth of the model
     * @param {(Prediction[])=} realGroundTruthOneQuery - Array of ground truths predictions for one query using the general groundTruth
     */
    constructor(queryOrObject, predictionsOneQuery, usedGroundTruthOneQuery, realGroundTruthOneQuery)
    {
        if(typeof queryOrObject === "string")
        {
            this._constructWithRawParameters(queryOrObject, predictionsOneQuery, usedGroundTruthOneQuery, realGroundTruthOneQuery)
        }
        else if(typeof queryOrObject === "object")
        {
            this._constructWithObj(queryOrObject);
        }
    }

    _constructWithRawParameters(query, predictionsOneQuery, usedGroundTruthOneQuery, realGroundTruthOneQuery)
    {
        this._query = query;

        //Sort predicted data
        predictionsOneQuery.sort((a, b) => b.relevance - a.relevance);

        let maxLength = Math.max(predictionsOneQuery.length, usedGroundTruthOneQuery.length);
        let data = [];
        for(let i = 0; i < maxLength; i++)
        {
            data.push([predictionsOneQuery[i], usedGroundTruthOneQuery[i]]);
        }

        this.data = data;
        this.usedGroundTruthLength = usedGroundTruthOneQuery.length;
        if(realGroundTruthOneQuery !== undefined)
        {
            this.realGroundTruthLength = realGroundTruthOneQuery.length;
        }
    }

    _constructWithObj(obj)
    {
        Object.assign(this, obj);

        let predictionsOneQuery = this.data.map(line => line[0]);
        predictionsOneQuery.sort((a, b) => b.relevance - a.relevance);

        this.data = this.data.map((line, index) => [predictionsOneQuery[index], line[1]]);
    }

    set query(query)
    {
        this._query = query;
    }

    get query()
    {
        return this._query;
    }

    set data(data)
    {
        this._data = data;
    }

    get data()
    {
        return this._data;
    }
}