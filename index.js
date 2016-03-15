var same = require('same-value');

var REMOVED = 'r';
var ADDED = 'a';
var EDITED = 'e';

var ARRAY = 'a';
var FUNCTION = 'f';
var DATE = 'd';

function isInstance(value){
    var type = typeof value;
    return value && type === 'object' || type === 'function';
}

function getId(){
    return (this.currentId++).toString(36);
}

function objectRemovedChanges(scope, object){
    var itemInfo = scope.trackedMap.get(object);

    itemInfo && itemInfo.occurances--;

    Object.keys(object).forEach(function(key){
        if(isInstance(object[key])){
            objectRemovedChanges(scope, object[key]);
        }
    });
}

function createInstanceInfo(scope, id, value){
    var lastInfo = {
            id: id,
            instance: value,
            lastState: {},
            occurances: false
        };

    scope.instances[lastInfo.id] = value;
    scope.trackedMap.set(value, lastInfo);

    return lastInfo;
}

function getInstanceInfo(scope, value){
    if(!isInstance(value)){
        return;
    }

    var lastInfo = scope.trackedMap.get(value);

    if(!lastInfo){
        lastInfo = createInstanceInfo(scope, scope.getId(), value);
    }

    return lastInfo;
}

function getInstanceId(value){
    var info = getInstanceInfo(this, value);

    return info && info.id;
}

function getRemovedChange(changes, lastInfo, object, oldKey){
    var scope = this;

    if(!(oldKey in object)){
        var oldValue = lastInfo.lastState[oldKey];
        changes.push([lastInfo.id, oldKey, REMOVED]);

        if(isInstance(oldValue) && scope.trackedMap.has(oldValue)){
            objectRemovedChanges(scope, oldValue);
        }

        delete lastInfo.lastState[oldKey];
    }
}

function getRemovedChanges(changes, lastInfo, object){
    function getChange(oldKey){
        this.getRemovedChange(changes, lastInfo, object, oldKey);
    }

    Object.keys(lastInfo.lastState).forEach(getChange, this);
}

function getCurrentChange(changes, lastInfo, object, currentKey, scanned, instanceChanges){
    var scope = this;

    var type = currentKey in lastInfo.lastState ? EDITED : ADDED,
        oldValue = lastInfo.lastState[currentKey],
        currentValue = object[currentKey],
        change = [lastInfo.id, currentKey, type],
        changed = !same(oldValue, currentValue);


    if(changed){
        changes.push(change);
        if(isInstance(oldValue) && scope.trackedMap.has(oldValue)){
            objectRemovedChanges(scope, oldValue);
        }
    }else if(type === ADDED){ // Previously no key, now key, but value is undefined.
        changes.push(change);
        lastInfo.lastState[currentKey] = currentValue;
        return;
    }


    if(!isInstance(currentValue)){
        change.push(currentValue);
        lastInfo.lastState[currentKey] = currentValue;
        return;
    }

    var valueChanges = scope.getObjectChanges(currentValue, scanned),
        valueInfo = scope.trackedMap.get(currentValue);

    if(changed){
        valueInfo.occurances++;
        change.push([valueInfo.id]);
        lastInfo.lastState[currentKey] = currentValue;
    }

    if(valueChanges && (valueChanges.changes.length || valueChanges.instanceChanges.length)){
        changes.push.apply(changes, valueChanges.changes);
        instanceChanges.push.apply(instanceChanges, valueChanges.instanceChanges);
    }
}

function getCurrentChanges(changes, lastInfo, object, scanned, instanceChanges){
    function getChange(currentKey){
        this.getCurrentChange(changes, lastInfo, object, currentKey, scanned, instanceChanges);
    }

    Object.keys(object).forEach(getChange, this);
}

function createInstanceDefinition(scope, instance){
    var result = scope.settings.serialiser(instance);

    if(!result){
        result = [];
        var value = instance;

        if(value instanceof Date){
            return [value.toISOString(), DATE];
        }

        if(typeof value === 'function'){
            result.push(function(){return instance.apply(this, arguments)}, FUNCTION);
        }else if(Array.isArray(value)){
            result.push({}, ARRAY);
        }else if(value && typeof value === 'object'){
            result.push({});
        }
    }

    Object.keys(instance).forEach(function(key){
        var id = scope.viscous.getId(instance[key]);
        result[0][key] = id ? [id] : instance[key];
    });

    return result;
}

function getObjectChanges(object, scanned){
    if(scanned.has(object)){
        return;
    }
    scanned.add(object);

    var scope = this;

    var lastInfo = getInstanceInfo(scope, object),
        instanceChanges = [],
        isNew = lastInfo.occurances === false && object !== scope.state;

    if(isNew){
        lastInfo.occurances = 0;
    }

    var changes = [];
    scope.getRemovedChanges(changes, lastInfo, object);
    scope.getCurrentChanges(changes, lastInfo, object, scanned, instanceChanges);

    if(isNew){
        instanceChanges.push([lastInfo.id, createInstanceDefinition(scope, object)]);
    }

    return {
        instanceChanges: instanceChanges,
        changes: changes
    };
}

function changes(){
    var scope = this,
        result = scope.getObjectChanges(scope.state, new WeakSet());

    var instanceChanges = Object.keys(scope.instances).reduce(function(changes, key){
        var instance = scope.instances[key],
            itemInfo = scope.trackedMap.get(instance);

        if(instance !== scope.state && itemInfo.occurances < 1){
            scope.trackedMap.delete(instance);
            delete scope.instances[itemInfo.id];
            changes.push([itemInfo.id, REMOVED]);
        }

        return changes;
    }, []);

    var changes = [result.instanceChanges.concat(instanceChanges)].concat(result.changes);

    return changes;
}

function getState(){
    var scope = this;

    scope.viscous.changes();

    return [Object.keys(scope.instances).reverse().map(function(key){
        return [key, createInstanceDefinition(scope, scope.instances[key])];
    })];
}

function applyRootChange(scope, newState, toInflate){
    if(Array.isArray(newState)){
        newState = newState[0];
        toInflate.push([scope.state, newState]);
    }

    Object.keys(scope.state).forEach(function(key){
        if(!key in newState){
            delete scope.state[key];
        }
    });

    Object.keys(newState).forEach(function(key){
        scope.state[key] = newState[key];
    });
}

function inflateDefinition(scope, result, properties){
    Object.keys(properties).forEach(function(key){
        if(Array.isArray(properties[key])){
            result[key] = scope.viscous.getInstance(properties[key][0]);
        }
    });
}

function createInstance(scope, definition, toInflate){
    if(Array.isArray(definition)){
        var type = definition[1],
            properties = definition[0];

        var result = scope.settings.deserialiser(definition);

        if(result){
            return result;
        }

        if(!type){
            result = {};
        }
        if(type === ARRAY){
            result = [];
        }
        if(type === FUNCTION){
            result = properties;
        }
        if(type === DATE){
            result = new Date(properties);
        }

        if(isInstance(result)){
            toInflate.push([result, properties]);
        }

        return result;
    }
}

function apply(changes){
    var scope = this,
        instanceChanges = changes[0],
        toInflate = [];

    instanceChanges.forEach(function(instanceChange){
        if(instanceChange[1] === REMOVED){
            var instance = scope.instances[instanceChange[0]];
            scope.trackedMap.delete(instance);
            delete scope.instances[instanceChange[0]];
        }else{
            if(scope.viscous.getInstance(instanceChange[0]) === scope.state){
                applyRootChange(scope, instanceChange[1], toInflate);
            }else{
                createInstanceInfo(scope, instanceChange[0], createInstance(scope, instanceChange[1], toInflate));
            }
        }
    });

    toInflate.forEach(function(change){
        inflateDefinition(scope, change[0], change[1]);
    });

    for(var i = 1; i < changes.length; i++){
        var change = changes[i];

        if(change[2] === REMOVED){
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

function viscous(state, settings){
    if(!settings){
        settings = {
            serialiser: function(){},
            deserialiser: function(){}
        };
    }

    var viscous = {};

    var scope = {
        settings: settings,
        viscous: viscous,
        currentId: 0,
        state: state || {},
        trackedMap: new WeakMap(),
        instances: {}
    };

    // Scope bound for perf.
    scope.getCurrentChanges = getCurrentChanges.bind(scope);
    scope.getCurrentChange = getCurrentChange.bind(scope);
    scope.getRemovedChanges = getRemovedChanges.bind(scope);
    scope.getRemovedChange = getRemovedChange.bind(scope);
    scope.getObjectChanges = getObjectChanges.bind(scope);

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
