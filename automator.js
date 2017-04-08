const
    async = require('async');
    csv = require('fast-csv'),
    fs = require('fs'),
    request = require('request');

function getBestMatchingString(strings, words)
{
    let bestScore = 0;
    let bestMatch = null;

    // Calculate match scores
    strings.forEach((website) =>
    {
        let score = 0;
        words.forEach((word) =>
        {
            if (website.indexOf(word) !== -1)
            {
                score += 1;
            }
        });

        if (score > bestScore)
        {
            bestMatch = website;
            bestScore = score;
        }
    });

    return bestMatch;
}


function analyzeData()
{
    const stream = fs.createReadStream("contacts.csv");

    const uploadToHubspotQueue = async.queue((data, callback) =>
    {
        request({
            method: "GET",
            uri: `https://api.hubapi.com/contacts/v1/contact/email/${data.email}/profile`,
            qs: {
                "hapikey": "0c226fd9-641a-4d64-b2b7-790dd75c90ec"
            },
            json: true
        }, function (error, response, body)
        {
            if (body.status === "error" && body.message == "contact does not exist")
            {
                // Create the contact
                request({
                    method: "POST",
                    uri: `https://api.hubapi.com/contacts/v1/contact/`,
                    qs: {
                        "hapikey": "0c226fd9-641a-4d64-b2b7-790dd75c90ec"
                    },
                    body: {
                        "properties": [
                            {
                                "property": "email",
                                "value": data.email
                            },
                            {
                                "property": "firstname",
                                "value": data.firstName
                            },
                            {
                                "property": "lastname",
                                "value": data.lastName
                            },
                            {
                                "property": "website",
                                "value": data.website
                            },
                            {
                                "property": "linkedinbio",
                                "value": data.profileUrl
                            },
                            {
                                "property": "jobtitle",
                                "value": data.title
                            },
                            {
                                "property": "contact_type",
                                "value": "Sales Lead"
                            }
                        ]
                    },
                    json: true
                }, function (error, response, body)
                {
                    return callback();
                });

            }
            else
            {
                // Do nothing
                return callback();
            }
        });
    }, 1);


    const getEmailQueue = async.queue((data, callback) =>
    {
        request({
            method: "GET",
            uri: `https://hunter.io/v2/email-finder?domain=asana.com&first_name=Dustin&last_name=Moskovitz`,
            qs: {
                'domain': data.website,
                'first_name': data.firstName,
                'last_name': data.lastName,
                "api_key": "80f15f37c62f264ad46426f83ff151cbec422e71"
            },
            headers: {},
            json: true
        }, function (error, response, body)
        {
            data.email = body.data.email;

            uploadToHubspotQueue.push(data);
            return callback();
        });
    }, 1);

    const websiteQueue = async.queue((data, callback) =>
    {
        const extractedData = {
            firstName: data['First name'],
            lastName: data['Last name'],
            profileUrl: data['Profile url'],
            title: data['Title']
        }

        const titleWords = data.Title.toLowerCase().split(' ');
        const organization1Words = data['Organization 1'].toLowerCase().split(' ');
        const organization2Words = data['Organization 2'].toLowerCase().split(' ');
        const organization3Words = data['Organization 2'].toLowerCase().split(' ');

        // Figure out which of the websites is the one that is relevant
        const websites = [
            data['Website 1'].toLowerCase(),
            data['Website 2'].toLowerCase(),
            data['Website 3'].toLowerCase()
        ];

        extractedData.website = getBestMatchingString(websites, titleWords);
        if (!extractedData.website)
        {
            extractedData.website = getBestMatchingString(websites, organization1Words);
        }
        if (!extractedData.website)
        {
            extractedData.website = getBestMatchingString(websites, organization2Words);
        }
        if (!extractedData.website)
        {
            extractedData.website = getBestMatchingString(websites, organization3Words);
        }

        if (!extractedData.website)
        {
            request({
                method: "GET",
                uri: `https://api.cognitive.microsoft.com/bing/v5.0/search`,
                qs: {
                    'q': data['Organization 1'],
                    'count': '10',
                    'mkt': 'en-CA'
                },
                headers: {"Ocp-Apim-Subscription-Key": "a7d6aad955e7422e8504ddfe96034171"},
                json: true
            }, function (error, response, body)
            {
                if (!error)
                {

                }

                // console.log('error:', error); // Print the error if one occurred
                // console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
                // // console.log('body:', JSON.stringify(body, null, 2)); // Print the HTML for the Google homepage.
                //
                // console.log(body.webPages.value[0].displayUrl)

                extractedData.website = body.webPages.value[0].displayUrl;

                getEmailQueue.push(extractedData);

                return callback();
            });
        }
        else
        {
            return callback();
        }
    }, 1);

    const csvStream = csv({
        headers: true
    })
        .on("data", function(data)
        {
            websiteQueue.push(data);
        })
        .on("end", function()
        {

        });

    stream.pipe(csvStream);
}


analyzeData();


"0c226fd9-641a-4d64-b2b7-790dd75c90ec"