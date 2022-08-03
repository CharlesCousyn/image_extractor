# Image extractor


**Warning: this project is based on the assumption that you use projects [Search Activities](https://github.com/CharlesCousyn/search_activities) and [Image retrieval](https://github.com/CharlesCousyn/image_retrieval) to obtain the images to be analyzed.**


**Requirements** <br/>
- [Node.js]
- [NPM]
- [All necessary to run TensorFlowJS (see [here](https://github.com/tensorflow/tfjs/blob/master/tfjs-node/README.md))]

**How to install the project?** <br/>
Just run ```npm install```

**How to run the project?** <br/>
If you want to run only for a particular configuration given in file ``generalConfig.json``, use the command ```npm start```

If you want to run only for multiple configurations given in file ``experimentationsConfig.json``, use the command ```npm experimentation```

**Where can I change my parameters?** <br/>
In the root folder, in the files ```generalConfig.json``` for using a particular configuration, ``experimentationsConfig.json`` for using multiple configurations and in ``modelsConfig.json`` to configure object detection/classification model parameters

**Where can I find the results?** <br/>
In the folder ``resultFiles``. More precisely, in the folders named using your configuration (ex: ``inception_resnet_v2 google 50 sum``)

The format of result files is JSON and is the following:
```
{
    "query": "answer_the_phone",
    "data": [
        {
            "label": "cellular telephone", //The object detected using a particular model
            "relevance": 180.73915372416377, //The aggregated score computed using multiple images
            "correct": null //attibute only used to compute performance metrics (see groundTruthModel folder and performanceMetrics.js)
        },
        ...
    ]
}
```


**Where are the files responsible for computing performances?** <br/>
In the root folder, in the file ``performanceMetrics.js``