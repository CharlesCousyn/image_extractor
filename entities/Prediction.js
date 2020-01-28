/** Class representing a prediction. */
export default class Prediction
{
    /**
     * Create a prediction.
     * @param {string} label - The label
     * @param {number} relevance - The score of relevance
     * @param {Boolean} correct - The relevance boolean
     */
    constructor(label, relevance, correct)
    {
        this.label = label;
        this.relevance = relevance;
        this.correct = correct;
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