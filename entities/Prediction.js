/** Class representing a prediction. */
export default class Prediction
{
    /**
     * Create results.
     * @param {string|Object} labelOrObject - Label or object used to initiate a prediction
     * @param {number=} relevance - The score of relevance
     * @param {Boolean=} correct - The relevance boolean
     */
    constructor(labelOrObject, relevance, correct)
    {
        if(typeof labelOrObject === "string")
        {
            this._constructWithRawParameters(labelOrObject, relevance, correct)
        }
        else if(typeof labelOrObject === "object")
        {
            this._constructWithObj(labelOrObject);
        }
    }

    /**
     * Create a prediction.
     * @param {string} label - The label
     * @param {number} relevance - The score of relevance
     * @param {Boolean} correct - The relevance boolean
     */
    _constructWithRawParameters(label, relevance, correct)
    {
        this.label = label;
        this.relevance = relevance;
        this.correct = correct;
    }

    /**
     * Create a prediction.
     * @param {Object} obj - Object used to initiate prediction
     */
    _constructWithObj(obj)
    {
        Object.assign(this, obj);
    }

    set label(label)
    {
        this._label = label;
    }

    get label()
    {
        return this._label;
    }

    set relevance(relevance)
    {
        this._relevance = relevance;
    }

    get relevance()
    {
        return this._relevance;
    }

    set correct(correct)
    {
        this._correct = correct;
    }

    get correct()
    {
        return this._correct;
    }
}