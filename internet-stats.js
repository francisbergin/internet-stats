const assert = require('assert');
const Chart = require('chart.js');
const Datastore = require('nedb');
const schedule = require('node-schedule');
const speedTest = require('speedtest-net');
const wifiName = require('wifi-name');

var db = new Datastore({filename: 'stats.db', autoload: true});

var chartColors = [
    'rgb(255, 99, 132)', // red
    'rgb(255, 159, 64)', // orange
    'rgb(255, 205, 86)', // yellow
    'rgb(75, 192, 192)', // green
    'rgb(54, 162, 235)', // blue
    'rgb(153, 102, 255)', // purple
    'rgb(201, 203, 207)', // grey
];

var insertInternetStatus = (accessPointName, accessPointError, speedTestData, speedTestError) => {
    console.log('inserting document');

    db.insert({
        datetime: (new Date()).toISOString(),
        accessPointName: accessPointName,
        accessPointError: accessPointError,
        speedTestData: speedTestData,
        speedTestError: speedTestError,
    }, (err, result) => {
        assert.equal(err, null);
        console.log(result);
        refreshData();
    });
}

var worker = () => {
    console.log('new worker run');

    var test = speedTest({maxTime: 5000});
    var wifi = wifiName();

    test.on('data', speedTestData => {
        console.log('got data');
        wifi.then(accessPointName => {
            console.log(accessPointName);
            insertInternetStatus(accessPointName, null, speedTestData, null);
        }).catch(accessPointError => {
            console.log(accessPointError);
            insertInternetStatus(null, accessPointError.message, speedTestData, null);
        });
    });

    test.on('error', speedTestError => {
        console.log('got error');
        wifi.then(accessPointName => {
            console.log(accessPointName);
            insertInternetStatus(accessPointName, null, null, speedTestError);
        }).catch(accessPointError => {
            console.log(accessPointError);
            insertInternetStatus(null, accessPointError.message, null, speedTestError);
        });
    });
}

var job = schedule.scheduleJob({minute: [0, 30]}, worker);

var refreshData = () => {
    db.find({$not: {accessPointName: null}}).sort({datetime: 1}).exec((error, docs) => {
        var data = {};
        var chartColorsIndex = 0;

        docs.forEach(doc => {
            if (!data.hasOwnProperty(doc.accessPointName)) {
                data[doc.accessPointName] = {
                    downloadData: {
                        label: doc.accessPointName,
                        backgroundColor: chartColors[chartColorsIndex],
                        borderColor: chartColors[chartColorsIndex],
                        fill: false,
                        data: [],
                        cubicInterpolationMode: 'monotone',
                        // lineTension: 0,
                    },
                    uploadData: {
                        label: doc.accessPointName,
                        backgroundColor: chartColors[chartColorsIndex],
                        borderColor: chartColors[chartColorsIndex],
                        fill: false,
                        data: [],
                        cubicInterpolationMode: 'monotone',
                        // lineTension: 0,
                    },
                };

                chartColorsIndex = (chartColorsIndex + 1) % chartColors.length;
            }
            data[doc.accessPointName].downloadData.data.push({
                x: doc.datetime,
                y: doc.speedTestData === null ? 0 : doc.speedTestData.speeds.download,
            });
            data[doc.accessPointName].uploadData.data.push({
                x: doc.datetime,
                y: doc.speedTestData === null ? 0 : doc.speedTestData.speeds.upload,
            });
        });

        var downloadDatasets = [];
        var uploadDatasets = [];

        for (var key in data) {
            downloadDatasets.push(data[key].downloadData);
            uploadDatasets.push(data[key].uploadData);
        }

        window.myDownloadLine.config.data.datasets = downloadDatasets;
        window.myDownloadLine.update();

        window.myUploadLine.config.data.datasets = uploadDatasets;
        window.myUploadLine.update();

        console.log(downloadDatasets);
        console.log(uploadDatasets);
    });
}

var config = {
    type: 'line',
    data: {
        datasets: []
    },
    options: {
        title: {
            display: true,
            text: ''
        },
        scales: {
            xAxes: [{
                type: 'time',
                time: {
                    tooltipFormat: 'll HH:mm'
                },
                scaleLabel: {
                    display: true,
                    labelString: 'time'
                }
            }],
            yAxes: [{
                scaleLabel: {
                    display: true,
                    labelString: 'speed (Mb/s)'
                }
            }]
        },
    }
};

var downloadConfig = JSON.parse(JSON.stringify(config));
downloadConfig.options.title.text = 'download speed (Mb/s)';

var uploadConfig = JSON.parse(JSON.stringify(config));
uploadConfig.options.title.text = 'upload speed (Mb/s)';

var downloadCtx = document.getElementById("downloadCanvas").getContext("2d");
var uploadCtx = document.getElementById("uploadCanvas").getContext("2d");

window.myDownloadLine = new Chart(downloadCtx, downloadConfig);
window.myUploadLine = new Chart(uploadCtx, uploadConfig);

document.getElementById('refreshData').addEventListener('click', function() {
    refreshData();
});

document.getElementById('triggerWorker').addEventListener('click', function() {
    worker();
});

refreshData();
