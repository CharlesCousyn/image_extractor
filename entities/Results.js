/** Class representing Results of a query. */
export default class Results
{
    /**
     * Create results.
     * @param {string|Object} query - The query
     * @param {(Prediction[])=} predictionsOneQuery - Array of predictions for one query
     * @param {(Prediction[])=} groundTruthsOneQuery - Array of ground truths predictions for one query
     */
    constructor(queryOrObject, predictionsOneQuery, groundTruthsOneQuery)
    {
        if(typeof queryOrObject === "string")
        {
            this._constructWithRawParameters(queryOrObject, predictionsOneQuery, groundTruthsOneQuery)
        }
        else if(typeof queryOrObject === "object")
        {
            this._constructWithObj(queryOrObject);
        }
    }

    _constructWithRawParameters(query, predictionsOneQuery, groundTruthsOneQuery)
    {
        this._query = query;

        //Sort predicted data
        predictionsOneQuery.sort((a, b) => b.relevance - a.relevance);

        let maxLength = Math.max(predictionsOneQuery.length, groundTruthsOneQuery.length);
        let data = [];
        for(let i = 0; i < maxLength; i++)
        {
            data.push([predictionsOneQuery[i], groundTruthsOneQuery[i]]);
        }

        this.data = data;
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