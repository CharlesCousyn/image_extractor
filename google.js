//Init
let results = [];
let titleRelatedImage = "";
let urlRelatedWebsite = "";
let urlImage = "";
const containingBloc = document.getElementById("Sva75c");
async function waitForMillseconds(milliseconds)
{
    return new Promise(((resolve, reject) => {setTimeout(resolve, milliseconds);}))
}

async function loop()
{
    let ariaDisabled = containingBloc.querySelector("div > div > div.pxAole > div.tvh9oe.BIB1wf > div > div.OUZ5W > div.zjoqD > div > div.ZGGHx > a.gvi3cf").getAttribute("aria-disabled");
    console.log("ariaDisabled", ariaDisabled);
    if( ariaDisabled === "false")
    {
        titleRelatedImage = containingBloc.querySelector("div > div > div.pxAole > div.tvh9oe.BIB1wf > div > div.OUZ5W > div.QnfS4e > div:nth-child(2) > a").textContent;
        urlRelatedWebsite = containingBloc.querySelector("div > div > div.pxAole > div.tvh9oe.BIB1wf > div > div.OUZ5W > div.QnfS4e > div:nth-child(2) > a").getAttribute("href");
        let waitingTime = 0;
        do
        {
            urlImage = containingBloc.querySelector("div > div > div.pxAole > div.tvh9oe.BIB1wf > div > div.OUZ5W > div.zjoqD > div > div.v4dQwb > a > img").getAttribute("src");
            console.log(urlImage.substring(0, 5));
            await waitForMillseconds(100);
            waitingTime += 100;
        }while(urlImage.substring(0, 5) === "data:" && waitingTime < 15000);
        //#Sva75c > div > div > div.pxAole > div.tvh9oe.BIB1wf > div > div.OUZ5W > div.zjoqD > div > div.v4dQwb > a > img

        results.push({titleRelatedImage, urlRelatedWebsite, urlImage});

        containingBloc.querySelector("div > div > div.pxAole > div.tvh9oe.BIB1wf > div > div.OUZ5W > div.zjoqD > div > div.ZGGHx > a.gvi3cf").click();
        await waitForMillseconds(100);
        waitingTime += 100;

    }
    else
    {
        throw new Error("No more results");
    }
}

//Loop
(async function()
{
    try
    {
        for(let i = 0; i < 2500; i++)
        {
            await loop();
            console.log(results.length);
        }
        console.log(results);
    }
    catch(e)
    {
        console.log(results);
    }
})();