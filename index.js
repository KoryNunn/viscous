var same = require('same-value');

function isInstance(value){
    var type = typeof value;
    return value && type === 'object' || type === 'function';
}

function getId(){
    return (this.currentId++).toString(36);
}

function objectRemovedChanges(scope, object){
    var itemInfo = scope.trackedMap.get(object);

    itemInfo.occurances--;

    for(key in object){
        if(isInstance(object[key])){
            objectRemovedChanges(scope, object[key]);
        }
    }
}

function getInstanceInfo(scope, value){
    if(!isInstance(value)){
        return;
    }

    var lastInfo = scope.trackedMap.get(value);

    if(!lastInfo){
        lastInfo = {
            id: scope.getId(),
            instance: value,
            lastState: {},
            occurances: false
        };
        scope.instances[lastInfo.id] = value;
        scope.trackedMap.set(value, lastInfo);
    }

    return lastInfo;
}

function getInstanceId(value){
    var info = getInstanceInfo(this, value);

    return info && info.id;
}

function getRemovedChange(scope, changes, lastInfo, object, oldKey){
    if(!(oldKey in object)){
        var oldValue = lastInfo.lastState[oldKey];
        changes.push([lastInfo.id, oldKey, 'r']);

        if(isInstance(oldValue) && scope.trackedMap.has(oldValue)){
            objectRemovedChanges(scope, oldValue);
        }

        delete lastInfo.lastState[oldKey];
    }
}

function getRemovedChanges(scope, changes, lastInfo, object){
    for(var oldKey in lastInfo.lastState){
        getRemovedChange(scope, changes, lastInfo, object, oldKey);
    }
}

function getCurrentChange(scope, changes, lastInfo, object, currentKey, scanned, instanceChanges){
    var type = currentKey in lastInfo.lastState ? 'e' : 'a',
        oldValue = lastInfo.lastState[currentKey],
        currentValue = object[currentKey],
        change = [lastInfo.id, currentKey, type],
        changed = !same(oldValue, currentValue);

    if(changed){
        if(isInstance(oldValue) && scope.trackedMap.has(oldValue)){
            objectRemovedChanges(scope, oldValue);
        }
    }else{
        // Previously no key, now key, but value is undefined.
        if(type === 'a'){
            changes.push(change);
        }
    }

    lastInfo.lastState[currentKey] = currentValue;

    if(!isInstance(currentValue)){
        change.push(currentValue);
    }else{
        var valueChanges = getObjectChanges(scope, currentValue, scanned),
            valueInfo = scope.trackedMap.get(currentValue);

        valueInfo.occurances++;
        change.push([valueInfo.id]);

        if(valueChanges){
            changes.push.apply(changes, valueChanges.changes);
            instanceChanges.push.apply(instanceChanges, valueChanges.instanceChanges);
        }
    }

    if(changed){
        changes.push(change);
    }
}

function getCurrentChanges(scope, changes, lastInfo, object, scanned, instanceChanges){
    for(var currentKey in object){
        getCurrentChange(scope, changes, lastInfo, object, currentKey, scanned, instanceChanges);
    }
}

function getObjectChanges(scope, object, scanned){
    var lastInfo = getInstanceInfo(scope, object),
        newKeys,
        removedKeys,
        instanceChanges = [];

    if(!scanned){
        scanned = new WeakSet();
    }

    if(scanned.has(object)){
        return;
    }

    scanned.add(object);

    var isNew = lastInfo.occurances === false && object !== scope.state;

    if(isNew){
        lastInfo.occurances = 0;
    }

    var changes = [];
    getRemovedChanges(scope, changes, lastInfo, object);
    getCurrentChanges(scope, changes, lastInfo, object, scanned, instanceChanges);

    if(isNew){
        instanceChanges.push([lastInfo.id, object]);
    }

    return {
        instanceChanges: instanceChanges,
        changes: changes
    };
}

function changes(){
    var scope = this,
        result = getObjectChanges(scope, scope.state);

    var instanceChanges = Object.keys(scope.instances).reduce(function(changes, key){
        var instance = scope.instances[key],
            itemInfo = scope.trackedMap.get(instance);

        if(instance !== scope.state && !itemInfo.occurances){
            scope.trackedMap.delete(instance);
            delete scope.instances[itemInfo.id];
            changes.push([itemInfo.id, 'r']);
        }

        return changes;
    }, []);

    return [result.instanceChanges.concat(instanceChanges)].concat(result.changes);
}

function getState(){
    var state = this;

    state.viscous.changes();

    return [Object.keys(state.instances).reverse().map(function(key){
        return [key, state.instances[key]];
    })];
}

function applyRootChange(scope, newState){
    for(var key in scope.state){
        if(!key in newState){
            delete scope.state[key];
        }
    }
    for(var key in newState){
        scope.state[key] = newState[key];
    }
}

function apply(changes){
    var scope = this,
        instanceChanges = changes[0];

    instanceChanges.forEach(function(instanceChange){
        if(instanceChange[1] === 'r'){
            delete scope.instances[instanceChange[0]];
        }else{
            if(scope.instances[instanceChange[0]] === scope.state){
                applyRootChange(scope, instanceChange[1]);
            }else{
                scope.instances[instanceChange[0]] = instanceChange[1];
            }
        }
    });

    for(var i = 1; i < changes.length; i++){
        var change = changes[i];

        if(change[2] === 'r'){
            delete scope.instances[change[0]][change[1]];
        }else{
            var value = change[3];

            if(Array.isArray(change[3])){
                value = scope.instances[change[3]];
            }

            scope.instances[change[0]][change[1]] = value;
        }
    }
}

function getInstanceById(id){
    return this.instances[id];
}

function viscous(state){
    var viscous = {};

    var scope = {
        viscous, viscous,
        currentId: 0,
        state: state || {},
        trackedMap: new WeakMap(),
        instances: {}
    };

    scope.getId = getId.bind(scope);

    viscous.changes = changes.bind(scope);
    viscous.apply = apply.bind(scope);
    viscous.state = getState.bind(scope);
    viscous.getId = getInstanceId.bind(scope);
    viscous.getInstance = getInstanceById.bind(scope);

    viscous.changes();

    return viscous;
}

module.exports = viscous;
