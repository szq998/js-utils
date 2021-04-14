const workWrapper = (work, results, args, globalID, poolID) => {
    // to save promise result and return poolID
    const onSettled = (isError, globalID, poolID, val) => {
        // save result
        if (isError) results[globalID] = { status: 'rejected', reason: val };
        else results[globalID] = { status: 'fulfilled', value: val };
        // promise value is replaced by poolID
        return poolID;
    };
    // for conveniently set handler
    const getHandlers = (globalID, poolID) => {
        return [
            onSettled.bind(null, false, globalID, poolID), // onFulfilled handler
            onSettled.bind(null, true, globalID, poolID), // onRejected handler
        ];
    };
    // wrap
    return work(...args).then(...getHandlers(globalID, poolID));
};

async function workerPool(work, argList, maxWorker) {
    const results = Array(argList.length);
    // wrap work to retrieve results and to implement worker pool
    const wrappedWork = workWrapper.bind(null, work, results);
    // create the initial worker pool
    let globalID = 0; // globalID for index argList and results
    const workers = [...Array(maxWorker)].map(() => {
        const currID = globalID++;
        if (currID >= argList.length) {
            return Promise.resolve();
        }
        return wrappedWork(argList[currID], currID, currID);
    });
    // add new worker only if some worker is settled
    for (; globalID < argList.length; globalID++) {
        const settledPoolID = await Promise.race(workers); // poolID for index worker in worker pool
        workers[settledPoolID] = wrappedWork(
            argList[globalID],
            globalID,
            settledPoolID
        );
    }
    // the remaining workers
    await Promise.all(workers);
    return results;
}

export default workerPool;
