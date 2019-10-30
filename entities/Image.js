export default class Image
{
	constructor(activityName, pathToOriginalImage, imageName, size, pathToResizedImage)
	{
		this._activityName = activityName;
		this._pathToOriginalImage = pathToOriginalImage;
		this._imageName = imageName;
		this._size = size;
		this._pathToResizedImage = pathToResizedImage;
	}

	set activityName(value)
	{
		this._activityName = value;
	}

	get activityName()
	{
		return this._activityName;
	}

	set pathToOriginalImage(value)
	{
		this._pathToOriginalImage = value;
	}

	get pathToOriginalImage()
	{
		return this._pathToOriginalImage;
	}

	set imageName(value)
	{
		this._imageName = value;
	}

	get imageName()
	{
		return this._imageName;
	}

	set size(value)
	{
		this._size = value;
	}

	get size()
	{
		return this._size;
	}

	set pathToResizedImage(value)
	{
		this._pathToResizedImage = value;
	}

	get pathToResizedImage()
	{
		return this._pathToResizedImage;
	}
}