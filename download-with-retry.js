import http from 'http';
import https from 'https';

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

function downloadWithMaxTimeAndRetry(url, maxTime = 20000, maxRetry = 10) {
    return new Promise((resolve, reject) =>
        _downloadWithMaxTimeAndRetry(url, resolve, reject, maxTime, maxRetry)
    );
}

function _downloadWithMaxTimeAndRetry(
    url,
    successHandler,
    failureHandler,
    maxTime,
    maxRetry
) {
    // download function will retry recursively
    (function download(currRetry = 0) {
        let request;
        let response;
        // set retry timer
        const retry = setTimeout(() => {
            // destroy connection
            response?.destroy?.();
            request?.destroy?.();
            if (currRetry < maxRetry) {
                // retry
                download(currRetry + 1);
            } else {
                failureHandler(
                    new Error(
                        `Retry download exceeds ${maxRetry} times for "${url}".`
                    )
                );
            }
        }, maxTime);
        // try download
        request = autoProto(url).get(url, (res) => {
            response = res;
            fullyReadResponse(res)
                .then((data) => {
                    clearTimeout(retry);
                    successHandler(data);
                })
                .catch(() => {}); // omit any exceptions because there will be a retry anyway
        });
        // omit any exceptions because there will be a retry anyway
        request.on('error', () => {});
    })();
}

export default downloadWithMaxTimeAndRetry;
