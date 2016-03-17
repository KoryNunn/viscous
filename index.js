var sameValue = require('same-value');

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

function same(a, b){
    if(isInstance(a) && a instanceof Date && a !== b){
        return false;
    }

    return sameValue(a, b);
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
    var instanceInfo = {
            id: id,
            instance: value,
            lastState: {},
            occurances: false
        };

    scope.instances[instanceInfo.id] = value;
    scope.trackedMap.set(value, instanceInfo);

    return instanceInfo;
}

function getInstanceInfo(scope, value){
    if(!isInstance(value)){
        return;
    }

    var instanceInfo = scope.trackedMap.get(value);

    if(!instanceInfo){
        instanceInfo = createInstanceInfo(scope, scope.getId(), value);
    }

    return instanceInfo;
}

function getInstanceId(value){
    var info = getInstanceInfo(this, value);

    return info && info.id;
}

function getRemovedChange(instanceInfo, object, oldKey){
    var scope = this;

    if(!(oldKey in object)){
        var oldValue = instanceInfo.lastState[oldKey];
        this.nextChange.push([instanceInfo.id, oldKey, REMOVED]);

        if(isInstance(oldValue) && scope.trackedMap.has(oldValue)){
            objectRemovedChanges(scope, oldValue);
        }

        delete instanceInfo.lastState[oldKey];
    }
}

function getRemovedChanges(instanceInfo, object){
    function getChange(oldKey){
        this.getRemovedChange(instanceInfo, object, oldKey);
    }

    Object.keys(instanceInfo.lastState).forEach(getChange, this);
}

function getCurrentChange(instanceInfo, object, currentKey){
    var scope = this;

    var type = currentKey in instanceInfo.lastState ? EDITED : ADDED,
        oldValue = instanceInfo.lastState[currentKey],
        currentValue = object[currentKey],
        change = [instanceInfo.id, currentKey, type],
        changed = !same(oldValue, currentValue);

    if(changed || type === ADDED){
        instanceInfo.lastState[currentKey] = currentValue;
        this.nextChange.push(change);
        if(changed && isInstance(oldValue) && scope.trackedMap.has(oldValue)){
            objectRemovedChanges(scope, oldValue);
        }
    }

    if(!isInstance(currentValue)){
        change.push(currentValue);
        return;
    }

    scope.getObjectChanges(currentValue);

    if(changed){
        var valueInfo = scope.trackedMap.get(currentValue);

        valueInfo.occurances++;
        change.push([valueInfo.id]);
    }
}

function getCurrentChanges(instanceInfo, object){
    function getChange(currentKey){
        this.getCurrentChange(instanceInfo, object, currentKey);
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

function getCleanChangesArray(){

}

function getObjectChanges(object){
    if(this.scanned.has(object)){
        return;
    }
    this.scanned.add(object);

    var scope = this;

    var instanceInfo = getInstanceInfo(scope, object),
        isNew = instanceInfo.occurances === false && object !== scope.state;

    if(isNew){
        instanceInfo.occurances = 0;
    }

    scope.getRemovedChanges(instanceInfo, object);

    scope.getCurrentChanges(instanceInfo, object);

    if(!isNew){
        return;
    }

    this.nextChange[0].push([instanceInfo.id, createInstanceDefinition(scope, object)]);
}

function changes(){
    var scope = this;

    // This is how not to write code 101,
    // But anything in the name of performance :P
    scope.nextChange[0] = [];
    scope.scanned = new WeakSet();

    scope.getObjectChanges(scope.state);

    Object.keys(scope.instances).forEach(function(key){
        var instance = scope.instances[key],
            itemInfo = scope.trackedMap.get(instance);

        if(instance !== scope.state && itemInfo.occurances < 1){
            scope.trackedMap.delete(instance);
            delete scope.instances[itemInfo.id];
            scope.nextChange[0].unshift([itemInfo.id, REMOVED]);
        }
    });

    return scope.nextChange.splice(0, scope.nextChange.length);
}

function getState(){
    var scope = this;

    scope.viscous.changes();

    return [Object.keys(scope.instances).reverse().map(function(key){
        return [key, createInstanceDefinition(scope, scope.instances[key])];
    })];
}

function applyObjectChange(target, newState, toInflate){
    if(Array.isArray(newState)){
        newState = newState[0];
        toInflate.push([target, newState]);
    }

    Object.keys(target).forEach(function(key){
        if(!key in newState){
            delete target[key];
        }
    });

    Object.keys(newState).forEach(function(key){
        target[key] = newState[key];
    });
}

function applyRootChange(scope, newState, toInflate){
    applyObjectChange(scope.state, newState, toInflate);
}

function inflateDefinition(scope, result, properties){
    Object.keys(properties).forEach(function(key){
        if(Array.isArray(properties[key])){
            result[key] = scope.viscous.getInstance(properties[key][0]);
        }else{
            result[key] = properties[key];
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

function describe(data){
    if(isInstance(data)){
        if(this.trackedMap.has(data)){
            return [this.viscous.getId(data)];
        }
        return createInstanceDefinition(this, data);
    }

    return data;
}

function inflate(description){
    var scope = this;

    if(Array.isArray(description) && typeof description[0] === 'string'){
        return scope.viscous.getInstance(description[0]);
    }

    if(isInstance(description)){
        var toInflate = [];

        var result = createInstance(scope, description, toInflate);

        toInflate.forEach(function(change){
            inflateDefinition(scope, change[0], change[1]);
        });

        return result;
    }

    return description;
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
        nextChange: [],
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
    viscous.describe = describe.bind(scope);
    viscous.inflate = inflate.bind(scope);

    viscous.changes();

    return viscous;
}

module.exports = viscous;
