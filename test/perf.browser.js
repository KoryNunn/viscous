(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var same = require('same-value');

function isInstance(value){
    var type = typeof value;
    return type === 'object' || type === 'function';
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

function getRemovedChanges(scope, changes, lastInfo, oldKeys, currentKeys){
    oldKeys
    .reduce(function(result, oldKey){
        if(!~currentKeys.indexOf(oldKey)){
            var oldValue = lastInfo.lastState[oldKey];
            result.push([lastInfo.id, oldKey, 'r']);

            if(isInstance(oldValue) && scope.trackedMap.has(oldValue)){
                objectRemovedChanges(scope, oldValue);
            }

            delete lastInfo.lastState[oldKey];
        }
        return result;
    }, changes);
}

function getCurrentChanges(scope, changes, lastInfo, oldKeys, currentKeys, object, scanned, instanceChanges){
    currentKeys
    .reduce(function(result, currentKey){
        var type = ~oldKeys.indexOf(currentKey) ? 'e' : 'a',
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
                result.push(change);
            }
        }

        lastInfo.lastState[currentKey] = currentValue;

        if(!isInstance(currentValue)){
            change.push(currentValue);
        }else{
            var valueChanges = getObjectChanges(scope, currentValue, scanned);

            if(valueChanges){
                change.push([valueChanges.id]);

                result.push.apply(result, valueChanges.changes);
                instanceChanges.push.apply(instanceChanges, valueChanges.instanceChanges);
            }
        }

        if(changed){
            result.push(change);
        }

        return result;
    }, changes);
}

function getObjectChanges(scope, object, scanned){
    var lastInfo = scope.trackedMap.get(object),
        oldKeys,
        currentKeys = Object.keys(object),
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

    if(!lastInfo){
        lastInfo = {
            id: scope.getId(),
            instance: object,
            lastState: {},
            occurances: 0
        };
        scope.instances[lastInfo.id] = object;
        scope.trackedMap.set(object, lastInfo);

        instanceChanges.push([lastInfo.id, object]);

        oldKeys = [];
    }else{
        oldKeys = Object.keys(lastInfo.lastState);
    }

    lastInfo.occurances++;

    var changes = [];
    getRemovedChanges(scope, changes, lastInfo, oldKeys, currentKeys);
    getCurrentChanges(scope, changes, lastInfo, oldKeys, currentKeys, object, scanned, instanceChanges);

    return {
        instanceChanges: instanceChanges,
        changes: changes,
        id: lastInfo.id
    };
}

function changes(){
    var scope = this,
        result = getObjectChanges(scope, scope.state);

    var instanceChanges = Object.keys(scope.instances).reduce(function(changes, key){
        var instance = scope.instances[key],
            itemInfo = scope.trackedMap.get(instance);

        if(!itemInfo.occurances){
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

    return Object.keys(state.instances).map(function(key){
        return [key, state.instances[key]];
    });
}

function apply(changes){
    var scope = this,
        instanceChanges = changes[0];

    instanceChanges.forEach(function(instanceChange){
        if(instanceChange[1] === 'r'){
            delete scope.instances[instanceChange[0]];
        }else{
            scope.instances[instanceChange[0]] = instanceChange[1];
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
},{"../":1}]},{},[3]);
