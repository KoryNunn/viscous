(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

function getId(int){
    if(int === 0){
        return 'root';
    }
    return this.viscousId + ':' + int.toString(36);
}

function createId(){
    return this.getId(this.currentId++);
}

function createInstanceInfo(scope, id, value){
    var instanceInfo = {
            id: id,
            instance: value,
            lastState: {},
            new: true
        };

    scope.setInstance(id, value);
    scope.trackedMap.set(value, instanceInfo);

    return instanceInfo;
}

function getInstanceInfo(scope, value){
    if(!isInstance(value)){
        return;
    }

    var instanceInfo = scope.trackedMap.get(value);

    if(!instanceInfo){
        instanceInfo = createInstanceInfo(scope, scope.createId(), value);
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

        delete instanceInfo.lastState[oldKey];
    }
}

function getRemovedChanges(instanceInfo, object){
    function getChange(oldKey){
        this.getRemovedChange(instanceInfo, object, oldKey);
    }

    Object.keys(instanceInfo.lastState).forEach(getChange, this);
}

function getCurrentChange(instanceInfo, instance, currentKey){
    var scope = this;

    var type = instanceInfo.lastState.hasOwnProperty(currentKey) ? EDITED : ADDED,
        oldValue = instanceInfo.lastState[currentKey],
        currentValue = instance[currentKey],
        change = [instanceInfo.id, currentKey, type],
        changed = !same(oldValue, currentValue);

    if(changed || type === ADDED){
        instanceInfo.lastState[currentKey] = currentValue;
        this.nextChange.push(change);
    }

    if(!isInstance(currentValue)){
        change.push(currentValue);
        return;
    }

    var instanceId = scope.getInstanceId(instance[currentKey]);

    scope.currentInstances.add(instanceId);

    scope.getObjectChanges(currentValue);

    if(changed){
        change.push([instanceId]);
    }
}

function getCurrentChanges(instanceInfo, instance){
    function getChange(currentKey){
        this.getCurrentChange(instanceInfo, instance, currentKey);
    }

    Object.keys(instance).forEach(getChange, this);
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
        var id = scope.getInstanceId(instance[key]);
        result[0][key] = id ? [id] : instance[key];
    });

    return result;
}

function getObjectChanges(object){
    if(this.scanned.has(object)){
        return;
    }
    this.scanned.add(object);

    var scope = this;

    var instanceInfo = getInstanceInfo(scope, object),
        isNew = instanceInfo.new && object !== scope.state;

    scope.getRemovedChanges(instanceInfo, object);
    scope.getCurrentChanges(instanceInfo, object);

    if(!isNew){
        return;
    }

    instanceInfo.new = false;
    this.nextChange[0].push([instanceInfo.id, createInstanceDefinition(scope, object)]);
}

function createGarbageChange(id){
    var scope = this;
    if(!scope.currentInstances.has(id)){
        scope.trackedMap.delete(scope.getInstance(id));
        scope.removeInstance(id);
        scope.nextChange[0].unshift([id, REMOVED]);
    }
}

function changes(){
    var scope = this;

    // This is how not to write code 101,
    // But anything in the name of performance :P

    scope.nextChange[0] = [];
    scope.scanned = new WeakSet();
    scope.currentInstances.clear();
    scope.currentInstances.add(this.getId(0));

    scope.getObjectChanges(scope.state);

    Object.keys(this.instances).forEach(createGarbageChange, this);

    return scope.nextChange.splice(0, scope.nextChange.length);
}

function getState(){
    var scope = this;

    scope.changes();

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
            result[key] = scope.getInstance(properties[key][0]);
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
            var instance = scope.getInstance(instanceChange[0]);
            scope.trackedMap.delete(instance);
            scope.removeInstance(instanceChange[0]);
        }else{
            if(scope.getInstance(instanceChange[0]) === scope.state){
                applyRootChange(scope, instanceChange[1], toInflate);
            }else{
                var existingInstance = scope.getInstance(instanceChange[0]);

                if(existingInstance){
                    toInflate.push([existingInstance, instanceChange[1][0]]);
                }else{
                   createInstanceInfo(scope, instanceChange[0], createInstance(scope, instanceChange[1], toInflate));
               }
            }
        }
    });

    toInflate.forEach(function(change){
        inflateDefinition(scope, change[0], change[1]);
    });

    for(var i = 1; i < changes.length; i++){
        var change = changes[i];

        if(change[2] === REMOVED){
            delete scope.getInstance(change[0])[change[1]];
        }else{
            var value = change[3];

            if(Array.isArray(change[3])){
                value = scope.getInstance(change[3]);
            }

            scope.getInstance(change[0])[change[1]] = value;
        }
    }
}

function getInstanceById(id){
    return this.instances[id];
}

function setInstanceById(id, value){
    this.instances[id] = value;
}

function removeInstanceById(id){
    delete this.instances[id];
}

function buildIdMap(scope, data, ids){
    if(!isInstance(data)){
        return;
    }

    if(scope.trackedMap.has(data)){
        ids[scope.getInstanceId(data)] = data;
        return ids;
    }

    ids[scope.getInstanceId(data)] = data;

    for(var key in data){
        buildIdMap(scope, data[key], ids);
    }

    return ids;
}

function describe(data){
    var scope = this;

    if(isInstance(data)){
        if(scope.trackedMap.has(data)){
            return [scope.getInstanceId(data)];
        }

        var ids = buildIdMap(scope, data, {});

        return Object.keys(ids).map(function(key){
            return [key, createInstanceDefinition(scope, scope.instances[key])];
        });
    }

    return data;
}

function inflate(description){
    var scope = this;

    if(Array.isArray(description) && typeof description[0] === 'string'){
        return scope.getInstance(description[0]);
    }

    if(isInstance(description)){
        var toInflate = [];

        scope.viscous.apply([description]);

        return scope.getInstance(description[0][0]);
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
        currentInstances: new Set(),
        settings: settings,
        viscous: viscous,
        viscousId: settings.viscousId || parseInt(Math.random() * Math.pow(36,2)).toString(36),
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
    scope.getInstance = getInstanceById.bind(scope);
    scope.setInstance = setInstanceById.bind(scope);
    scope.removeInstance = removeInstanceById.bind(scope);
    scope.getInstanceId = getInstanceId.bind(scope);
    scope.changes = changes.bind(scope);

    scope.getId = getId.bind(scope);
    scope.createId = createId.bind(scope);

    viscous.changes = scope.changes;
    viscous.apply = apply.bind(scope);
    viscous.state = getState.bind(scope);
    viscous.getId = scope.getInstanceId;
    viscous.getInstance = scope.getInstance;
    viscous.describe = describe.bind(scope);
    viscous.inflate = inflate.bind(scope);

    viscous.changes();

    return viscous;
}

module.exports = viscous;

},{"same-value":2}],2:[function(require,module,exports){
module.exports = function isSame(a, b){
    if(a === b){
        return true;
    }

    if(
        typeof a !== typeof b ||
        typeof a === 'object' &&
        !(a instanceof Date && b instanceof Date)
    ){
        return false;
    }

    return String(a) === String(b);
};
},{}],3:[function(require,module,exports){

var viscous = require('../');

var state1 = {},
    differ1 = viscous(state1);

var state2 = {},
    differ2 = viscous(state2);

var run = setInterval(function(){

    var changyness = Math.random() * 5;

    for(var i = 0; i < 100; i++){
        state1[i] = state1[i] || {};
        for(var j = 0; j < 100; j++){
            state1[i][j] = state1[i][j] || {};
            state1[i][j].a = Math.floor(Math.random() * changyness);
            if(!Math.floor(Math.random() * 10)){
                state1[i][j].b = {};
            }
        }
    }

    var now = Date.now();
    var changes = differ1.changes();
    console.log(Date.now() - now, changes.length);
    differ2.apply(changes);
    console.log(Date.now() - now);
}, 100);

setTimeout(function(){
    clearInterval(run);
}, 4000);
},{"../":1}]},{},[3])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy5udm0vdmVyc2lvbnMvbm9kZS92NS4zLjAvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiaW5kZXguanMiLCJub2RlX21vZHVsZXMvc2FtZS12YWx1ZS9pbmRleC5qcyIsInRlc3QvcGVyZi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIHNhbWVWYWx1ZSA9IHJlcXVpcmUoJ3NhbWUtdmFsdWUnKTtcbnZhciBSRU1PVkVEID0gJ3InO1xudmFyIEFEREVEID0gJ2EnO1xudmFyIEVESVRFRCA9ICdlJztcblxudmFyIEFSUkFZID0gJ2EnO1xudmFyIEZVTkNUSU9OID0gJ2YnO1xudmFyIERBVEUgPSAnZCc7XG5cbmZ1bmN0aW9uIGlzSW5zdGFuY2UodmFsdWUpe1xuICAgIHZhciB0eXBlID0gdHlwZW9mIHZhbHVlO1xuICAgIHJldHVybiB2YWx1ZSAmJiB0eXBlID09PSAnb2JqZWN0JyB8fCB0eXBlID09PSAnZnVuY3Rpb24nO1xufVxuXG5mdW5jdGlvbiBzYW1lKGEsIGIpe1xuICAgIGlmKGlzSW5zdGFuY2UoYSkgJiYgYSBpbnN0YW5jZW9mIERhdGUgJiYgYSAhPT0gYil7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gc2FtZVZhbHVlKGEsIGIpO1xufVxuXG5mdW5jdGlvbiBnZXRJZChpbnQpe1xuICAgIGlmKGludCA9PT0gMCl7XG4gICAgICAgIHJldHVybiAncm9vdCc7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnZpc2NvdXNJZCArICc6JyArIGludC50b1N0cmluZygzNik7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUlkKCl7XG4gICAgcmV0dXJuIHRoaXMuZ2V0SWQodGhpcy5jdXJyZW50SWQrKyk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUluc3RhbmNlSW5mbyhzY29wZSwgaWQsIHZhbHVlKXtcbiAgICB2YXIgaW5zdGFuY2VJbmZvID0ge1xuICAgICAgICAgICAgaWQ6IGlkLFxuICAgICAgICAgICAgaW5zdGFuY2U6IHZhbHVlLFxuICAgICAgICAgICAgbGFzdFN0YXRlOiB7fSxcbiAgICAgICAgICAgIG5ldzogdHJ1ZVxuICAgICAgICB9O1xuXG4gICAgc2NvcGUuc2V0SW5zdGFuY2UoaWQsIHZhbHVlKTtcbiAgICBzY29wZS50cmFja2VkTWFwLnNldCh2YWx1ZSwgaW5zdGFuY2VJbmZvKTtcblxuICAgIHJldHVybiBpbnN0YW5jZUluZm87XG59XG5cbmZ1bmN0aW9uIGdldEluc3RhbmNlSW5mbyhzY29wZSwgdmFsdWUpe1xuICAgIGlmKCFpc0luc3RhbmNlKHZhbHVlKSl7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgaW5zdGFuY2VJbmZvID0gc2NvcGUudHJhY2tlZE1hcC5nZXQodmFsdWUpO1xuXG4gICAgaWYoIWluc3RhbmNlSW5mbyl7XG4gICAgICAgIGluc3RhbmNlSW5mbyA9IGNyZWF0ZUluc3RhbmNlSW5mbyhzY29wZSwgc2NvcGUuY3JlYXRlSWQoKSwgdmFsdWUpO1xuICAgIH1cblxuICAgIHJldHVybiBpbnN0YW5jZUluZm87XG59XG5cbmZ1bmN0aW9uIGdldEluc3RhbmNlSWQodmFsdWUpe1xuICAgIHZhciBpbmZvID0gZ2V0SW5zdGFuY2VJbmZvKHRoaXMsIHZhbHVlKTtcblxuICAgIHJldHVybiBpbmZvICYmIGluZm8uaWQ7XG59XG5cbmZ1bmN0aW9uIGdldFJlbW92ZWRDaGFuZ2UoaW5zdGFuY2VJbmZvLCBvYmplY3QsIG9sZEtleSl7XG4gICAgdmFyIHNjb3BlID0gdGhpcztcblxuICAgIGlmKCEob2xkS2V5IGluIG9iamVjdCkpe1xuICAgICAgICB2YXIgb2xkVmFsdWUgPSBpbnN0YW5jZUluZm8ubGFzdFN0YXRlW29sZEtleV07XG4gICAgICAgIHRoaXMubmV4dENoYW5nZS5wdXNoKFtpbnN0YW5jZUluZm8uaWQsIG9sZEtleSwgUkVNT1ZFRF0pO1xuXG4gICAgICAgIGRlbGV0ZSBpbnN0YW5jZUluZm8ubGFzdFN0YXRlW29sZEtleV07XG4gICAgfVxufVxuXG5mdW5jdGlvbiBnZXRSZW1vdmVkQ2hhbmdlcyhpbnN0YW5jZUluZm8sIG9iamVjdCl7XG4gICAgZnVuY3Rpb24gZ2V0Q2hhbmdlKG9sZEtleSl7XG4gICAgICAgIHRoaXMuZ2V0UmVtb3ZlZENoYW5nZShpbnN0YW5jZUluZm8sIG9iamVjdCwgb2xkS2V5KTtcbiAgICB9XG5cbiAgICBPYmplY3Qua2V5cyhpbnN0YW5jZUluZm8ubGFzdFN0YXRlKS5mb3JFYWNoKGdldENoYW5nZSwgdGhpcyk7XG59XG5cbmZ1bmN0aW9uIGdldEN1cnJlbnRDaGFuZ2UoaW5zdGFuY2VJbmZvLCBpbnN0YW5jZSwgY3VycmVudEtleSl7XG4gICAgdmFyIHNjb3BlID0gdGhpcztcblxuICAgIHZhciB0eXBlID0gaW5zdGFuY2VJbmZvLmxhc3RTdGF0ZS5oYXNPd25Qcm9wZXJ0eShjdXJyZW50S2V5KSA/IEVESVRFRCA6IEFEREVELFxuICAgICAgICBvbGRWYWx1ZSA9IGluc3RhbmNlSW5mby5sYXN0U3RhdGVbY3VycmVudEtleV0sXG4gICAgICAgIGN1cnJlbnRWYWx1ZSA9IGluc3RhbmNlW2N1cnJlbnRLZXldLFxuICAgICAgICBjaGFuZ2UgPSBbaW5zdGFuY2VJbmZvLmlkLCBjdXJyZW50S2V5LCB0eXBlXSxcbiAgICAgICAgY2hhbmdlZCA9ICFzYW1lKG9sZFZhbHVlLCBjdXJyZW50VmFsdWUpO1xuXG4gICAgaWYoY2hhbmdlZCB8fCB0eXBlID09PSBBRERFRCl7XG4gICAgICAgIGluc3RhbmNlSW5mby5sYXN0U3RhdGVbY3VycmVudEtleV0gPSBjdXJyZW50VmFsdWU7XG4gICAgICAgIHRoaXMubmV4dENoYW5nZS5wdXNoKGNoYW5nZSk7XG4gICAgfVxuXG4gICAgaWYoIWlzSW5zdGFuY2UoY3VycmVudFZhbHVlKSl7XG4gICAgICAgIGNoYW5nZS5wdXNoKGN1cnJlbnRWYWx1ZSk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgaW5zdGFuY2VJZCA9IHNjb3BlLmdldEluc3RhbmNlSWQoaW5zdGFuY2VbY3VycmVudEtleV0pO1xuXG4gICAgc2NvcGUuY3VycmVudEluc3RhbmNlcy5hZGQoaW5zdGFuY2VJZCk7XG5cbiAgICBzY29wZS5nZXRPYmplY3RDaGFuZ2VzKGN1cnJlbnRWYWx1ZSk7XG5cbiAgICBpZihjaGFuZ2VkKXtcbiAgICAgICAgY2hhbmdlLnB1c2goW2luc3RhbmNlSWRdKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdldEN1cnJlbnRDaGFuZ2VzKGluc3RhbmNlSW5mbywgaW5zdGFuY2Upe1xuICAgIGZ1bmN0aW9uIGdldENoYW5nZShjdXJyZW50S2V5KXtcbiAgICAgICAgdGhpcy5nZXRDdXJyZW50Q2hhbmdlKGluc3RhbmNlSW5mbywgaW5zdGFuY2UsIGN1cnJlbnRLZXkpO1xuICAgIH1cblxuICAgIE9iamVjdC5rZXlzKGluc3RhbmNlKS5mb3JFYWNoKGdldENoYW5nZSwgdGhpcyk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUluc3RhbmNlRGVmaW5pdGlvbihzY29wZSwgaW5zdGFuY2Upe1xuICAgIHZhciByZXN1bHQgPSBzY29wZS5zZXR0aW5ncy5zZXJpYWxpc2VyKGluc3RhbmNlKTtcblxuICAgIGlmKCFyZXN1bHQpe1xuICAgICAgICByZXN1bHQgPSBbXTtcbiAgICAgICAgdmFyIHZhbHVlID0gaW5zdGFuY2U7XG5cbiAgICAgICAgaWYodmFsdWUgaW5zdGFuY2VvZiBEYXRlKXtcbiAgICAgICAgICAgIHJldHVybiBbdmFsdWUudG9JU09TdHJpbmcoKSwgREFURV07XG4gICAgICAgIH1cblxuICAgICAgICBpZih0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpe1xuICAgICAgICAgICAgcmVzdWx0LnB1c2goZnVuY3Rpb24oKXtyZXR1cm4gaW5zdGFuY2UuYXBwbHkodGhpcywgYXJndW1lbnRzKX0sIEZVTkNUSU9OKTtcbiAgICAgICAgfWVsc2UgaWYoQXJyYXkuaXNBcnJheSh2YWx1ZSkpe1xuICAgICAgICAgICAgcmVzdWx0LnB1c2goe30sIEFSUkFZKTtcbiAgICAgICAgfWVsc2UgaWYodmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jyl7XG4gICAgICAgICAgICByZXN1bHQucHVzaCh7fSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBPYmplY3Qua2V5cyhpbnN0YW5jZSkuZm9yRWFjaChmdW5jdGlvbihrZXkpe1xuICAgICAgICB2YXIgaWQgPSBzY29wZS5nZXRJbnN0YW5jZUlkKGluc3RhbmNlW2tleV0pO1xuICAgICAgICByZXN1bHRbMF1ba2V5XSA9IGlkID8gW2lkXSA6IGluc3RhbmNlW2tleV07XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBnZXRPYmplY3RDaGFuZ2VzKG9iamVjdCl7XG4gICAgaWYodGhpcy5zY2FubmVkLmhhcyhvYmplY3QpKXtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLnNjYW5uZWQuYWRkKG9iamVjdCk7XG5cbiAgICB2YXIgc2NvcGUgPSB0aGlzO1xuXG4gICAgdmFyIGluc3RhbmNlSW5mbyA9IGdldEluc3RhbmNlSW5mbyhzY29wZSwgb2JqZWN0KSxcbiAgICAgICAgaXNOZXcgPSBpbnN0YW5jZUluZm8ubmV3ICYmIG9iamVjdCAhPT0gc2NvcGUuc3RhdGU7XG5cbiAgICBzY29wZS5nZXRSZW1vdmVkQ2hhbmdlcyhpbnN0YW5jZUluZm8sIG9iamVjdCk7XG4gICAgc2NvcGUuZ2V0Q3VycmVudENoYW5nZXMoaW5zdGFuY2VJbmZvLCBvYmplY3QpO1xuXG4gICAgaWYoIWlzTmV3KXtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGluc3RhbmNlSW5mby5uZXcgPSBmYWxzZTtcbiAgICB0aGlzLm5leHRDaGFuZ2VbMF0ucHVzaChbaW5zdGFuY2VJbmZvLmlkLCBjcmVhdGVJbnN0YW5jZURlZmluaXRpb24oc2NvcGUsIG9iamVjdCldKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlR2FyYmFnZUNoYW5nZShpZCl7XG4gICAgdmFyIHNjb3BlID0gdGhpcztcbiAgICBpZighc2NvcGUuY3VycmVudEluc3RhbmNlcy5oYXMoaWQpKXtcbiAgICAgICAgc2NvcGUudHJhY2tlZE1hcC5kZWxldGUoc2NvcGUuZ2V0SW5zdGFuY2UoaWQpKTtcbiAgICAgICAgc2NvcGUucmVtb3ZlSW5zdGFuY2UoaWQpO1xuICAgICAgICBzY29wZS5uZXh0Q2hhbmdlWzBdLnVuc2hpZnQoW2lkLCBSRU1PVkVEXSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBjaGFuZ2VzKCl7XG4gICAgdmFyIHNjb3BlID0gdGhpcztcblxuICAgIC8vIFRoaXMgaXMgaG93IG5vdCB0byB3cml0ZSBjb2RlIDEwMSxcbiAgICAvLyBCdXQgYW55dGhpbmcgaW4gdGhlIG5hbWUgb2YgcGVyZm9ybWFuY2UgOlBcblxuICAgIHNjb3BlLm5leHRDaGFuZ2VbMF0gPSBbXTtcbiAgICBzY29wZS5zY2FubmVkID0gbmV3IFdlYWtTZXQoKTtcbiAgICBzY29wZS5jdXJyZW50SW5zdGFuY2VzLmNsZWFyKCk7XG4gICAgc2NvcGUuY3VycmVudEluc3RhbmNlcy5hZGQodGhpcy5nZXRJZCgwKSk7XG5cbiAgICBzY29wZS5nZXRPYmplY3RDaGFuZ2VzKHNjb3BlLnN0YXRlKTtcblxuICAgIE9iamVjdC5rZXlzKHRoaXMuaW5zdGFuY2VzKS5mb3JFYWNoKGNyZWF0ZUdhcmJhZ2VDaGFuZ2UsIHRoaXMpO1xuXG4gICAgcmV0dXJuIHNjb3BlLm5leHRDaGFuZ2Uuc3BsaWNlKDAsIHNjb3BlLm5leHRDaGFuZ2UubGVuZ3RoKTtcbn1cblxuZnVuY3Rpb24gZ2V0U3RhdGUoKXtcbiAgICB2YXIgc2NvcGUgPSB0aGlzO1xuXG4gICAgc2NvcGUuY2hhbmdlcygpO1xuXG4gICAgcmV0dXJuIFtPYmplY3Qua2V5cyhzY29wZS5pbnN0YW5jZXMpLnJldmVyc2UoKS5tYXAoZnVuY3Rpb24oa2V5KXtcbiAgICAgICAgcmV0dXJuIFtrZXksIGNyZWF0ZUluc3RhbmNlRGVmaW5pdGlvbihzY29wZSwgc2NvcGUuaW5zdGFuY2VzW2tleV0pXTtcbiAgICB9KV07XG59XG5cbmZ1bmN0aW9uIGFwcGx5T2JqZWN0Q2hhbmdlKHRhcmdldCwgbmV3U3RhdGUsIHRvSW5mbGF0ZSl7XG4gICAgaWYoQXJyYXkuaXNBcnJheShuZXdTdGF0ZSkpe1xuICAgICAgICBuZXdTdGF0ZSA9IG5ld1N0YXRlWzBdO1xuICAgICAgICB0b0luZmxhdGUucHVzaChbdGFyZ2V0LCBuZXdTdGF0ZV0pO1xuICAgIH1cblxuICAgIE9iamVjdC5rZXlzKHRhcmdldCkuZm9yRWFjaChmdW5jdGlvbihrZXkpe1xuICAgICAgICBpZigha2V5IGluIG5ld1N0YXRlKXtcbiAgICAgICAgICAgIGRlbGV0ZSB0YXJnZXRba2V5XTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgT2JqZWN0LmtleXMobmV3U3RhdGUpLmZvckVhY2goZnVuY3Rpb24oa2V5KXtcbiAgICAgICAgdGFyZ2V0W2tleV0gPSBuZXdTdGF0ZVtrZXldO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBhcHBseVJvb3RDaGFuZ2Uoc2NvcGUsIG5ld1N0YXRlLCB0b0luZmxhdGUpe1xuICAgIGFwcGx5T2JqZWN0Q2hhbmdlKHNjb3BlLnN0YXRlLCBuZXdTdGF0ZSwgdG9JbmZsYXRlKTtcbn1cblxuZnVuY3Rpb24gaW5mbGF0ZURlZmluaXRpb24oc2NvcGUsIHJlc3VsdCwgcHJvcGVydGllcyl7XG4gICAgT2JqZWN0LmtleXMocHJvcGVydGllcykuZm9yRWFjaChmdW5jdGlvbihrZXkpe1xuICAgICAgICBpZihBcnJheS5pc0FycmF5KHByb3BlcnRpZXNba2V5XSkpe1xuICAgICAgICAgICAgcmVzdWx0W2tleV0gPSBzY29wZS5nZXRJbnN0YW5jZShwcm9wZXJ0aWVzW2tleV1bMF0pO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIHJlc3VsdFtrZXldID0gcHJvcGVydGllc1trZXldO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUluc3RhbmNlKHNjb3BlLCBkZWZpbml0aW9uLCB0b0luZmxhdGUpe1xuICAgIGlmKEFycmF5LmlzQXJyYXkoZGVmaW5pdGlvbikpe1xuICAgICAgICB2YXIgdHlwZSA9IGRlZmluaXRpb25bMV0sXG4gICAgICAgICAgICBwcm9wZXJ0aWVzID0gZGVmaW5pdGlvblswXTtcblxuICAgICAgICB2YXIgcmVzdWx0ID0gc2NvcGUuc2V0dGluZ3MuZGVzZXJpYWxpc2VyKGRlZmluaXRpb24pO1xuXG4gICAgICAgIGlmKHJlc3VsdCl7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoIXR5cGUpe1xuICAgICAgICAgICAgcmVzdWx0ID0ge307XG4gICAgICAgIH1cbiAgICAgICAgaWYodHlwZSA9PT0gQVJSQVkpe1xuICAgICAgICAgICAgcmVzdWx0ID0gW107XG4gICAgICAgIH1cbiAgICAgICAgaWYodHlwZSA9PT0gRlVOQ1RJT04pe1xuICAgICAgICAgICAgcmVzdWx0ID0gcHJvcGVydGllcztcbiAgICAgICAgfVxuICAgICAgICBpZih0eXBlID09PSBEQVRFKXtcbiAgICAgICAgICAgIHJlc3VsdCA9IG5ldyBEYXRlKHByb3BlcnRpZXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoaXNJbnN0YW5jZShyZXN1bHQpKXtcbiAgICAgICAgICAgIHRvSW5mbGF0ZS5wdXNoKFtyZXN1bHQsIHByb3BlcnRpZXNdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBhcHBseShjaGFuZ2VzKXtcbiAgICB2YXIgc2NvcGUgPSB0aGlzLFxuICAgICAgICBpbnN0YW5jZUNoYW5nZXMgPSBjaGFuZ2VzWzBdLFxuICAgICAgICB0b0luZmxhdGUgPSBbXTtcblxuICAgIGluc3RhbmNlQ2hhbmdlcy5mb3JFYWNoKGZ1bmN0aW9uKGluc3RhbmNlQ2hhbmdlKXtcbiAgICAgICAgaWYoaW5zdGFuY2VDaGFuZ2VbMV0gPT09IFJFTU9WRUQpe1xuICAgICAgICAgICAgdmFyIGluc3RhbmNlID0gc2NvcGUuZ2V0SW5zdGFuY2UoaW5zdGFuY2VDaGFuZ2VbMF0pO1xuICAgICAgICAgICAgc2NvcGUudHJhY2tlZE1hcC5kZWxldGUoaW5zdGFuY2UpO1xuICAgICAgICAgICAgc2NvcGUucmVtb3ZlSW5zdGFuY2UoaW5zdGFuY2VDaGFuZ2VbMF0pO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIGlmKHNjb3BlLmdldEluc3RhbmNlKGluc3RhbmNlQ2hhbmdlWzBdKSA9PT0gc2NvcGUuc3RhdGUpe1xuICAgICAgICAgICAgICAgIGFwcGx5Um9vdENoYW5nZShzY29wZSwgaW5zdGFuY2VDaGFuZ2VbMV0sIHRvSW5mbGF0ZSk7XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICB2YXIgZXhpc3RpbmdJbnN0YW5jZSA9IHNjb3BlLmdldEluc3RhbmNlKGluc3RhbmNlQ2hhbmdlWzBdKTtcblxuICAgICAgICAgICAgICAgIGlmKGV4aXN0aW5nSW5zdGFuY2Upe1xuICAgICAgICAgICAgICAgICAgICB0b0luZmxhdGUucHVzaChbZXhpc3RpbmdJbnN0YW5jZSwgaW5zdGFuY2VDaGFuZ2VbMV1bMF1dKTtcbiAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICBjcmVhdGVJbnN0YW5jZUluZm8oc2NvcGUsIGluc3RhbmNlQ2hhbmdlWzBdLCBjcmVhdGVJbnN0YW5jZShzY29wZSwgaW5zdGFuY2VDaGFuZ2VbMV0sIHRvSW5mbGF0ZSkpO1xuICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICB0b0luZmxhdGUuZm9yRWFjaChmdW5jdGlvbihjaGFuZ2Upe1xuICAgICAgICBpbmZsYXRlRGVmaW5pdGlvbihzY29wZSwgY2hhbmdlWzBdLCBjaGFuZ2VbMV0pO1xuICAgIH0pO1xuXG4gICAgZm9yKHZhciBpID0gMTsgaSA8IGNoYW5nZXMubGVuZ3RoOyBpKyspe1xuICAgICAgICB2YXIgY2hhbmdlID0gY2hhbmdlc1tpXTtcblxuICAgICAgICBpZihjaGFuZ2VbMl0gPT09IFJFTU9WRUQpe1xuICAgICAgICAgICAgZGVsZXRlIHNjb3BlLmdldEluc3RhbmNlKGNoYW5nZVswXSlbY2hhbmdlWzFdXTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICB2YXIgdmFsdWUgPSBjaGFuZ2VbM107XG5cbiAgICAgICAgICAgIGlmKEFycmF5LmlzQXJyYXkoY2hhbmdlWzNdKSl7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBzY29wZS5nZXRJbnN0YW5jZShjaGFuZ2VbM10pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzY29wZS5nZXRJbnN0YW5jZShjaGFuZ2VbMF0pW2NoYW5nZVsxXV0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZ2V0SW5zdGFuY2VCeUlkKGlkKXtcbiAgICByZXR1cm4gdGhpcy5pbnN0YW5jZXNbaWRdO1xufVxuXG5mdW5jdGlvbiBzZXRJbnN0YW5jZUJ5SWQoaWQsIHZhbHVlKXtcbiAgICB0aGlzLmluc3RhbmNlc1tpZF0gPSB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlSW5zdGFuY2VCeUlkKGlkKXtcbiAgICBkZWxldGUgdGhpcy5pbnN0YW5jZXNbaWRdO1xufVxuXG5mdW5jdGlvbiBidWlsZElkTWFwKHNjb3BlLCBkYXRhLCBpZHMpe1xuICAgIGlmKCFpc0luc3RhbmNlKGRhdGEpKXtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmKHNjb3BlLnRyYWNrZWRNYXAuaGFzKGRhdGEpKXtcbiAgICAgICAgaWRzW3Njb3BlLmdldEluc3RhbmNlSWQoZGF0YSldID0gZGF0YTtcbiAgICAgICAgcmV0dXJuIGlkcztcbiAgICB9XG5cbiAgICBpZHNbc2NvcGUuZ2V0SW5zdGFuY2VJZChkYXRhKV0gPSBkYXRhO1xuXG4gICAgZm9yKHZhciBrZXkgaW4gZGF0YSl7XG4gICAgICAgIGJ1aWxkSWRNYXAoc2NvcGUsIGRhdGFba2V5XSwgaWRzKTtcbiAgICB9XG5cbiAgICByZXR1cm4gaWRzO1xufVxuXG5mdW5jdGlvbiBkZXNjcmliZShkYXRhKXtcbiAgICB2YXIgc2NvcGUgPSB0aGlzO1xuXG4gICAgaWYoaXNJbnN0YW5jZShkYXRhKSl7XG4gICAgICAgIGlmKHNjb3BlLnRyYWNrZWRNYXAuaGFzKGRhdGEpKXtcbiAgICAgICAgICAgIHJldHVybiBbc2NvcGUuZ2V0SW5zdGFuY2VJZChkYXRhKV07XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaWRzID0gYnVpbGRJZE1hcChzY29wZSwgZGF0YSwge30pO1xuXG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyhpZHMpLm1hcChmdW5jdGlvbihrZXkpe1xuICAgICAgICAgICAgcmV0dXJuIFtrZXksIGNyZWF0ZUluc3RhbmNlRGVmaW5pdGlvbihzY29wZSwgc2NvcGUuaW5zdGFuY2VzW2tleV0pXTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRhdGE7XG59XG5cbmZ1bmN0aW9uIGluZmxhdGUoZGVzY3JpcHRpb24pe1xuICAgIHZhciBzY29wZSA9IHRoaXM7XG5cbiAgICBpZihBcnJheS5pc0FycmF5KGRlc2NyaXB0aW9uKSAmJiB0eXBlb2YgZGVzY3JpcHRpb25bMF0gPT09ICdzdHJpbmcnKXtcbiAgICAgICAgcmV0dXJuIHNjb3BlLmdldEluc3RhbmNlKGRlc2NyaXB0aW9uWzBdKTtcbiAgICB9XG5cbiAgICBpZihpc0luc3RhbmNlKGRlc2NyaXB0aW9uKSl7XG4gICAgICAgIHZhciB0b0luZmxhdGUgPSBbXTtcblxuICAgICAgICBzY29wZS52aXNjb3VzLmFwcGx5KFtkZXNjcmlwdGlvbl0pO1xuXG4gICAgICAgIHJldHVybiBzY29wZS5nZXRJbnN0YW5jZShkZXNjcmlwdGlvblswXVswXSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlc2NyaXB0aW9uO1xufVxuXG5mdW5jdGlvbiB2aXNjb3VzKHN0YXRlLCBzZXR0aW5ncyl7XG4gICAgaWYoIXNldHRpbmdzKXtcbiAgICAgICAgc2V0dGluZ3MgPSB7XG4gICAgICAgICAgICBzZXJpYWxpc2VyOiBmdW5jdGlvbigpe30sXG4gICAgICAgICAgICBkZXNlcmlhbGlzZXI6IGZ1bmN0aW9uKCl7fVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHZhciB2aXNjb3VzID0ge307XG5cbiAgICB2YXIgc2NvcGUgPSB7XG4gICAgICAgIG5leHRDaGFuZ2U6IFtdLFxuICAgICAgICBjdXJyZW50SW5zdGFuY2VzOiBuZXcgU2V0KCksXG4gICAgICAgIHNldHRpbmdzOiBzZXR0aW5ncyxcbiAgICAgICAgdmlzY291czogdmlzY291cyxcbiAgICAgICAgdmlzY291c0lkOiBzZXR0aW5ncy52aXNjb3VzSWQgfHwgcGFyc2VJbnQoTWF0aC5yYW5kb20oKSAqIE1hdGgucG93KDM2LDIpKS50b1N0cmluZygzNiksXG4gICAgICAgIGN1cnJlbnRJZDogMCxcbiAgICAgICAgc3RhdGU6IHN0YXRlIHx8IHt9LFxuICAgICAgICB0cmFja2VkTWFwOiBuZXcgV2Vha01hcCgpLFxuICAgICAgICBpbnN0YW5jZXM6IHt9XG4gICAgfTtcblxuICAgIC8vIFNjb3BlIGJvdW5kIGZvciBwZXJmLlxuICAgIHNjb3BlLmdldEN1cnJlbnRDaGFuZ2VzID0gZ2V0Q3VycmVudENoYW5nZXMuYmluZChzY29wZSk7XG4gICAgc2NvcGUuZ2V0Q3VycmVudENoYW5nZSA9IGdldEN1cnJlbnRDaGFuZ2UuYmluZChzY29wZSk7XG4gICAgc2NvcGUuZ2V0UmVtb3ZlZENoYW5nZXMgPSBnZXRSZW1vdmVkQ2hhbmdlcy5iaW5kKHNjb3BlKTtcbiAgICBzY29wZS5nZXRSZW1vdmVkQ2hhbmdlID0gZ2V0UmVtb3ZlZENoYW5nZS5iaW5kKHNjb3BlKTtcbiAgICBzY29wZS5nZXRPYmplY3RDaGFuZ2VzID0gZ2V0T2JqZWN0Q2hhbmdlcy5iaW5kKHNjb3BlKTtcbiAgICBzY29wZS5nZXRJbnN0YW5jZSA9IGdldEluc3RhbmNlQnlJZC5iaW5kKHNjb3BlKTtcbiAgICBzY29wZS5zZXRJbnN0YW5jZSA9IHNldEluc3RhbmNlQnlJZC5iaW5kKHNjb3BlKTtcbiAgICBzY29wZS5yZW1vdmVJbnN0YW5jZSA9IHJlbW92ZUluc3RhbmNlQnlJZC5iaW5kKHNjb3BlKTtcbiAgICBzY29wZS5nZXRJbnN0YW5jZUlkID0gZ2V0SW5zdGFuY2VJZC5iaW5kKHNjb3BlKTtcbiAgICBzY29wZS5jaGFuZ2VzID0gY2hhbmdlcy5iaW5kKHNjb3BlKTtcblxuICAgIHNjb3BlLmdldElkID0gZ2V0SWQuYmluZChzY29wZSk7XG4gICAgc2NvcGUuY3JlYXRlSWQgPSBjcmVhdGVJZC5iaW5kKHNjb3BlKTtcblxuICAgIHZpc2NvdXMuY2hhbmdlcyA9IHNjb3BlLmNoYW5nZXM7XG4gICAgdmlzY291cy5hcHBseSA9IGFwcGx5LmJpbmQoc2NvcGUpO1xuICAgIHZpc2NvdXMuc3RhdGUgPSBnZXRTdGF0ZS5iaW5kKHNjb3BlKTtcbiAgICB2aXNjb3VzLmdldElkID0gc2NvcGUuZ2V0SW5zdGFuY2VJZDtcbiAgICB2aXNjb3VzLmdldEluc3RhbmNlID0gc2NvcGUuZ2V0SW5zdGFuY2U7XG4gICAgdmlzY291cy5kZXNjcmliZSA9IGRlc2NyaWJlLmJpbmQoc2NvcGUpO1xuICAgIHZpc2NvdXMuaW5mbGF0ZSA9IGluZmxhdGUuYmluZChzY29wZSk7XG5cbiAgICB2aXNjb3VzLmNoYW5nZXMoKTtcblxuICAgIHJldHVybiB2aXNjb3VzO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHZpc2NvdXM7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzU2FtZShhLCBiKXtcbiAgICBpZihhID09PSBiKXtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYoXG4gICAgICAgIHR5cGVvZiBhICE9PSB0eXBlb2YgYiB8fFxuICAgICAgICB0eXBlb2YgYSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgIShhIGluc3RhbmNlb2YgRGF0ZSAmJiBiIGluc3RhbmNlb2YgRGF0ZSlcbiAgICApe1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIFN0cmluZyhhKSA9PT0gU3RyaW5nKGIpO1xufTsiLCJcbnZhciB2aXNjb3VzID0gcmVxdWlyZSgnLi4vJyk7XG5cbnZhciBzdGF0ZTEgPSB7fSxcbiAgICBkaWZmZXIxID0gdmlzY291cyhzdGF0ZTEpO1xuXG52YXIgc3RhdGUyID0ge30sXG4gICAgZGlmZmVyMiA9IHZpc2NvdXMoc3RhdGUyKTtcblxudmFyIHJ1biA9IHNldEludGVydmFsKGZ1bmN0aW9uKCl7XG5cbiAgICB2YXIgY2hhbmd5bmVzcyA9IE1hdGgucmFuZG9tKCkgKiA1O1xuXG4gICAgZm9yKHZhciBpID0gMDsgaSA8IDEwMDsgaSsrKXtcbiAgICAgICAgc3RhdGUxW2ldID0gc3RhdGUxW2ldIHx8IHt9O1xuICAgICAgICBmb3IodmFyIGogPSAwOyBqIDwgMTAwOyBqKyspe1xuICAgICAgICAgICAgc3RhdGUxW2ldW2pdID0gc3RhdGUxW2ldW2pdIHx8IHt9O1xuICAgICAgICAgICAgc3RhdGUxW2ldW2pdLmEgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBjaGFuZ3luZXNzKTtcbiAgICAgICAgICAgIGlmKCFNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMCkpe1xuICAgICAgICAgICAgICAgIHN0YXRlMVtpXVtqXS5iID0ge307XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgbm93ID0gRGF0ZS5ub3coKTtcbiAgICB2YXIgY2hhbmdlcyA9IGRpZmZlcjEuY2hhbmdlcygpO1xuICAgIGNvbnNvbGUubG9nKERhdGUubm93KCkgLSBub3csIGNoYW5nZXMubGVuZ3RoKTtcbiAgICBkaWZmZXIyLmFwcGx5KGNoYW5nZXMpO1xuICAgIGNvbnNvbGUubG9nKERhdGUubm93KCkgLSBub3cpO1xufSwgMTAwKTtcblxuc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgIGNsZWFySW50ZXJ2YWwocnVuKTtcbn0sIDQwMDApOyJdfQ==
