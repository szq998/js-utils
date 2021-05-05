class TimeoutError extends Error {}

const makePromiseInterruptible = (p) => {
    let interrupt;
    const wrapped = new Promise((resolve, reject) => {
        interrupt = reject;
        p.then(resolve, reject);
    });
    return [wrapped, interrupt];
};

/*
 * @description do some async task with timeout and retry
 * @param workWithAbortCleaner {Function} A function that either return a promise or an array contains a promise
 *                                        and a clean routine which will be called when current
 *                                        retry failed/aborted.
 * @param maxTime {Number} Maximum time for every retry.
 * @param maxRetry {Number} Maximum times of retry.
 * @param args {Array} Arguments for the workWithAbortCleaner function.
 * @return {any} determined by workWithAbortCleaner
 */
function workWithTimeoutAndRetry(
    workWithAbortCleaner,
    maxTime,
    maxRetry,
    ...args
) {
    return new Promise((resolve, reject) => {
        const errors = [];
        // recursively retry
        (async function work(currRetry = 0) {
            let workPromise, clean;
            const promiseOrArray = workWithAbortCleaner(...args);
            if (promiseOrArray.then !== undefined) {
                // it is a "thenable", which means no clean routine provided
                workPromise = promiseOrArray;
            } else if (Array.isArray(promiseOrArray)) {
                // with clean Routine
                [workPromise, clean] = promiseOrArray;
            } else {
                reject(
                    new TypeError(
                        'Work routine should return a promise or a promise and a clean function'
                    )
                );
                return;
            }
            // make work promise interruptible
            const [
                interruptibleWorkPromise,
                interruptWorkPromise,
            ] = makePromiseInterruptible(workPromise);
            // set retry routine when time out
            const retry = () => {
                // reject the time out work promise
                interruptWorkPromise(
                    maxRetry > 1
                        ? new TimeoutError(
                              `Timeout for the ${currRetry + 1}${
                                  currRetry === 0
                                      ? 'st'
                                      : currRetry === 1
                                      ? 'rd'
                                      : 'th'
                              } time`
                          )
                        : new TimeoutError()
                );
                // run clean routine if provided
                clean?.();
                if (currRetry < maxRetry) {
                    // retry
                    work(currRetry + 1);
                } else {
                    // end retry
                    reject(
                        maxRetry > 1
                            ? new AggregateError(
                                  errors,
                                  `Retry exceeds ${maxRetry} times`
                              )
                            : errors[0]
                    );
                }
            };
            const retryTimer = setTimeout(retry, maxTime);
            // do the work
            try {
                resolve(await interruptibleWorkPromise);
                clearTimeout(retryTimer);
            } catch (err) {
                errors.push(err);
                if (err instanceof TimeoutError) return;
                // work promise is not rejected by the retry routine
                clearTimeout(retryTimer);
                // retry immediately
                retry();
            }
        })();
    });
}

export default workWithTimeoutAndRetry;
