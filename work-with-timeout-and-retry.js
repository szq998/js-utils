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
 * @param args {Array} Arguments for the workWithAbortCleaner function.
 * @param maxTime {Number} Maximum time for every retry.
 * @param maxRetry {Number} Maximum times of retry.
 * @return {any} determined by workWithAbortCleaner
 */
function workWithTimeoutAndRetry(
    workWithAbortCleaner,
    args,
    maxTime,
    maxRetry
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
                interrupt,
            ] = makePromiseInterruptible(workPromise);
            // set retry routine when time out
            const onNeedRetry = () => {
                // run clean routine if provided
                clean?.();
                // reject then time out work promise
                interrupt(
                    new TimeoutError(
                        `Work is timeout for the ${currRetry + 1} time`
                    )
                );
                if (currRetry < maxRetry) {
                    // retry
                    work(currRetry + 1);
                } else {
                    // end retry
                    reject(
                        new AggregateError(
                            errors,
                            `Retry exceeds ${maxRetry} times`
                        )
                    );
                }
            };
            const retryTimer = setTimeout(onNeedRetry, maxTime);
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
                onNeedRetry();
            }
        })();
    });
}

export default workWithTimeoutAndRetry;
