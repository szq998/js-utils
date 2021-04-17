import http from 'http';
import https from 'https';
import workWithTimeoutAndRetry from './work-with-timeout-and-retry';

function autoProto(url) {
    if (url.startsWith('http://')) return http;
    else if (url.startsWith('https://')) return https;
    else throw new TypeError(`URL "${url}" has unsupported protocol`);
}

function fullyReadResponse(response, encoding = null) {
    return new Promise((resolve, reject) => {
        const { statusCode } = response;
        if (statusCode !== 200) {
            throw new Error(`Http failed with status code ${statusCode}`);
        }
        if (encoding) {
            response.setEncoding(encoding);
        }

        const allData = [];
        response.on('data', (partial) => {
            allData.push(partial);
        });

        response.on('end', () => {
            if (!response.complete) {
                throw new Error('Message Incomplete.');
            }

            const whole =
                typeof allData[0] === 'string'
                    ? allData.join('')
                    : Buffer.concat(allData);
            resolve(whole);
        });

        response.on('error', reject);
        response.socket.on('error', reject);
    });
}

function download(url) {
    let request;
    let response;
    const downloadPromise = new Promise((resolve, reject) => {
        request = autoProto(url).get(url, (res) => {
            response = res;
            resolve(fullyReadResponse(res));
        });
        request.on('error', reject);
    });
    const abortClean = () => {
        request?.destroy?.();
        response?.destroy?.();
    };
    return [downloadPromise, abortClean];
}

function downloadWithTimeoutAndRetry(url, maxTime, maxRetry) {
    return workWithTimeoutAndRetry(download, url, maxTime, maxRetry);
}

export default downloadWithTimeoutAndRetry;
