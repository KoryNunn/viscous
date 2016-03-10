(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

function createInstanceDefinition(scope, instance){
    var value = instance;
    if(typeof value === 'function'){
        value = function(){return instance.apply(this, arguments)};
    }
    if(typeof value === 'object'){
        value = Array.isArray(value) ? [] : {};
    }

    for(var key in instance){
        var id = scope.viscous.getId(instance[key]);
        value[key] = id ? [id] : instance[key];
    }

    return value;
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
        instanceChanges.push([lastInfo.id, createInstanceDefinition(scope, object)]);
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
    var scope = this;

    scope.viscous.changes();

    return [Object.keys(scope.instances).reverse().map(function(key){
        return [key, createInstanceDefinition(scope, scope.instances[key])];
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

function inflateDefinition(scope, definition){
    for(var key in definition){
        if(Array.isArray(definition[key])){
            definition[key] = scope.viscous.getInstance(definition[key]);
        }
    }
}

function apply(changes){
    var scope = this,
        instanceChanges = changes[0];

    instanceChanges.forEach(function(instanceChange){
        if(instanceChange[1] === 'r'){
            var instance = scope.instances[instanceChange[0]];
            scope.trackedMap.delete(instance);
            delete scope.instances[instanceChange[0]];
        }else{
            if(scope.instances[instanceChange[0]] === scope.state){
                inflateDefinition(scope, instanceChange[1]);
                applyRootChange(scope, instanceChange[1]);
            }else{
                inflateDefinition(scope, instanceChange[1]);
                createInstanceInfo(scope, instanceChange[0], instanceChange[1]);
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

    // setInterval(function(){
    //     console.log((typeof document).charAt(0), scope.instances);
    // }, 1000);

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy5udm0vdmVyc2lvbnMvbm9kZS92NS4zLjAvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiaW5kZXguanMiLCJub2RlX21vZHVsZXMvc2FtZS12YWx1ZS9pbmRleC5qcyIsInRlc3QvcGVyZi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBzYW1lID0gcmVxdWlyZSgnc2FtZS12YWx1ZScpO1xuXG5mdW5jdGlvbiBpc0luc3RhbmNlKHZhbHVlKXtcbiAgICB2YXIgdHlwZSA9IHR5cGVvZiB2YWx1ZTtcbiAgICByZXR1cm4gdmFsdWUgJiYgdHlwZSA9PT0gJ29iamVjdCcgfHwgdHlwZSA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZnVuY3Rpb24gZ2V0SWQoKXtcbiAgICByZXR1cm4gKHRoaXMuY3VycmVudElkKyspLnRvU3RyaW5nKDM2KTtcbn1cblxuZnVuY3Rpb24gb2JqZWN0UmVtb3ZlZENoYW5nZXMoc2NvcGUsIG9iamVjdCl7XG4gICAgdmFyIGl0ZW1JbmZvID0gc2NvcGUudHJhY2tlZE1hcC5nZXQob2JqZWN0KTtcblxuICAgIGl0ZW1JbmZvLm9jY3VyYW5jZXMtLTtcblxuICAgIGZvcihrZXkgaW4gb2JqZWN0KXtcbiAgICAgICAgaWYoaXNJbnN0YW5jZShvYmplY3Rba2V5XSkpe1xuICAgICAgICAgICAgb2JqZWN0UmVtb3ZlZENoYW5nZXMoc2NvcGUsIG9iamVjdFtrZXldKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlSW5zdGFuY2VJbmZvKHNjb3BlLCBpZCwgdmFsdWUpe1xuICAgIHZhciBsYXN0SW5mbyA9IHtcbiAgICAgICAgaWQ6IGlkLFxuICAgICAgICBpbnN0YW5jZTogdmFsdWUsXG4gICAgICAgIGxhc3RTdGF0ZToge30sXG4gICAgICAgIG9jY3VyYW5jZXM6IGZhbHNlXG4gICAgfTtcbiAgICBzY29wZS5pbnN0YW5jZXNbbGFzdEluZm8uaWRdID0gdmFsdWU7XG4gICAgc2NvcGUudHJhY2tlZE1hcC5zZXQodmFsdWUsIGxhc3RJbmZvKTtcblxuICAgIHJldHVybiBsYXN0SW5mbztcbn1cblxuZnVuY3Rpb24gZ2V0SW5zdGFuY2VJbmZvKHNjb3BlLCB2YWx1ZSl7XG4gICAgaWYoIWlzSW5zdGFuY2UodmFsdWUpKXtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBsYXN0SW5mbyA9IHNjb3BlLnRyYWNrZWRNYXAuZ2V0KHZhbHVlKTtcblxuICAgIGlmKCFsYXN0SW5mbyl7XG4gICAgICAgIGxhc3RJbmZvID0gY3JlYXRlSW5zdGFuY2VJbmZvKHNjb3BlLCBzY29wZS5nZXRJZCgpLCB2YWx1ZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGxhc3RJbmZvO1xufVxuXG5mdW5jdGlvbiBnZXRJbnN0YW5jZUlkKHZhbHVlKXtcbiAgICB2YXIgaW5mbyA9IGdldEluc3RhbmNlSW5mbyh0aGlzLCB2YWx1ZSk7XG5cbiAgICByZXR1cm4gaW5mbyAmJiBpbmZvLmlkO1xufVxuXG5mdW5jdGlvbiBnZXRSZW1vdmVkQ2hhbmdlKHNjb3BlLCBjaGFuZ2VzLCBsYXN0SW5mbywgb2JqZWN0LCBvbGRLZXkpe1xuICAgIGlmKCEob2xkS2V5IGluIG9iamVjdCkpe1xuICAgICAgICB2YXIgb2xkVmFsdWUgPSBsYXN0SW5mby5sYXN0U3RhdGVbb2xkS2V5XTtcbiAgICAgICAgY2hhbmdlcy5wdXNoKFtsYXN0SW5mby5pZCwgb2xkS2V5LCAnciddKTtcblxuICAgICAgICBpZihpc0luc3RhbmNlKG9sZFZhbHVlKSAmJiBzY29wZS50cmFja2VkTWFwLmhhcyhvbGRWYWx1ZSkpe1xuICAgICAgICAgICAgb2JqZWN0UmVtb3ZlZENoYW5nZXMoc2NvcGUsIG9sZFZhbHVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRlbGV0ZSBsYXN0SW5mby5sYXN0U3RhdGVbb2xkS2V5XTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdldFJlbW92ZWRDaGFuZ2VzKHNjb3BlLCBjaGFuZ2VzLCBsYXN0SW5mbywgb2JqZWN0KXtcbiAgICBmb3IodmFyIG9sZEtleSBpbiBsYXN0SW5mby5sYXN0U3RhdGUpe1xuICAgICAgICBnZXRSZW1vdmVkQ2hhbmdlKHNjb3BlLCBjaGFuZ2VzLCBsYXN0SW5mbywgb2JqZWN0LCBvbGRLZXkpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZ2V0Q3VycmVudENoYW5nZShzY29wZSwgY2hhbmdlcywgbGFzdEluZm8sIG9iamVjdCwgY3VycmVudEtleSwgc2Nhbm5lZCwgaW5zdGFuY2VDaGFuZ2VzKXtcbiAgICB2YXIgdHlwZSA9IGN1cnJlbnRLZXkgaW4gbGFzdEluZm8ubGFzdFN0YXRlID8gJ2UnIDogJ2EnLFxuICAgICAgICBvbGRWYWx1ZSA9IGxhc3RJbmZvLmxhc3RTdGF0ZVtjdXJyZW50S2V5XSxcbiAgICAgICAgY3VycmVudFZhbHVlID0gb2JqZWN0W2N1cnJlbnRLZXldLFxuICAgICAgICBjaGFuZ2UgPSBbbGFzdEluZm8uaWQsIGN1cnJlbnRLZXksIHR5cGVdLFxuICAgICAgICBjaGFuZ2VkID0gIXNhbWUob2xkVmFsdWUsIGN1cnJlbnRWYWx1ZSk7XG5cbiAgICBpZihjaGFuZ2VkKXtcbiAgICAgICAgaWYoaXNJbnN0YW5jZShvbGRWYWx1ZSkgJiYgc2NvcGUudHJhY2tlZE1hcC5oYXMob2xkVmFsdWUpKXtcbiAgICAgICAgICAgIG9iamVjdFJlbW92ZWRDaGFuZ2VzKHNjb3BlLCBvbGRWYWx1ZSk7XG4gICAgICAgIH1cbiAgICB9ZWxzZXtcbiAgICAgICAgLy8gUHJldmlvdXNseSBubyBrZXksIG5vdyBrZXksIGJ1dCB2YWx1ZSBpcyB1bmRlZmluZWQuXG4gICAgICAgIGlmKHR5cGUgPT09ICdhJyl7XG4gICAgICAgICAgICBjaGFuZ2VzLnB1c2goY2hhbmdlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGxhc3RJbmZvLmxhc3RTdGF0ZVtjdXJyZW50S2V5XSA9IGN1cnJlbnRWYWx1ZTtcblxuICAgIGlmKCFpc0luc3RhbmNlKGN1cnJlbnRWYWx1ZSkpe1xuICAgICAgICBjaGFuZ2UucHVzaChjdXJyZW50VmFsdWUpO1xuICAgIH1lbHNle1xuICAgICAgICB2YXIgdmFsdWVDaGFuZ2VzID0gZ2V0T2JqZWN0Q2hhbmdlcyhzY29wZSwgY3VycmVudFZhbHVlLCBzY2FubmVkKSxcbiAgICAgICAgICAgIHZhbHVlSW5mbyA9IHNjb3BlLnRyYWNrZWRNYXAuZ2V0KGN1cnJlbnRWYWx1ZSk7XG5cbiAgICAgICAgdmFsdWVJbmZvLm9jY3VyYW5jZXMrKztcbiAgICAgICAgY2hhbmdlLnB1c2goW3ZhbHVlSW5mby5pZF0pO1xuXG4gICAgICAgIGlmKHZhbHVlQ2hhbmdlcyl7XG4gICAgICAgICAgICBjaGFuZ2VzLnB1c2guYXBwbHkoY2hhbmdlcywgdmFsdWVDaGFuZ2VzLmNoYW5nZXMpO1xuICAgICAgICAgICAgaW5zdGFuY2VDaGFuZ2VzLnB1c2guYXBwbHkoaW5zdGFuY2VDaGFuZ2VzLCB2YWx1ZUNoYW5nZXMuaW5zdGFuY2VDaGFuZ2VzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmKGNoYW5nZWQpe1xuICAgICAgICBjaGFuZ2VzLnB1c2goY2hhbmdlKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdldEN1cnJlbnRDaGFuZ2VzKHNjb3BlLCBjaGFuZ2VzLCBsYXN0SW5mbywgb2JqZWN0LCBzY2FubmVkLCBpbnN0YW5jZUNoYW5nZXMpe1xuICAgIGZvcih2YXIgY3VycmVudEtleSBpbiBvYmplY3Qpe1xuICAgICAgICBnZXRDdXJyZW50Q2hhbmdlKHNjb3BlLCBjaGFuZ2VzLCBsYXN0SW5mbywgb2JqZWN0LCBjdXJyZW50S2V5LCBzY2FubmVkLCBpbnN0YW5jZUNoYW5nZXMpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlSW5zdGFuY2VEZWZpbml0aW9uKHNjb3BlLCBpbnN0YW5jZSl7XG4gICAgdmFyIHZhbHVlID0gaW5zdGFuY2U7XG4gICAgaWYodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKXtcbiAgICAgICAgdmFsdWUgPSBmdW5jdGlvbigpe3JldHVybiBpbnN0YW5jZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpfTtcbiAgICB9XG4gICAgaWYodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jyl7XG4gICAgICAgIHZhbHVlID0gQXJyYXkuaXNBcnJheSh2YWx1ZSkgPyBbXSA6IHt9O1xuICAgIH1cblxuICAgIGZvcih2YXIga2V5IGluIGluc3RhbmNlKXtcbiAgICAgICAgdmFyIGlkID0gc2NvcGUudmlzY291cy5nZXRJZChpbnN0YW5jZVtrZXldKTtcbiAgICAgICAgdmFsdWVba2V5XSA9IGlkID8gW2lkXSA6IGluc3RhbmNlW2tleV07XG4gICAgfVxuXG4gICAgcmV0dXJuIHZhbHVlO1xufVxuXG5mdW5jdGlvbiBnZXRPYmplY3RDaGFuZ2VzKHNjb3BlLCBvYmplY3QsIHNjYW5uZWQpe1xuICAgIHZhciBsYXN0SW5mbyA9IGdldEluc3RhbmNlSW5mbyhzY29wZSwgb2JqZWN0KSxcbiAgICAgICAgbmV3S2V5cyxcbiAgICAgICAgcmVtb3ZlZEtleXMsXG4gICAgICAgIGluc3RhbmNlQ2hhbmdlcyA9IFtdO1xuXG4gICAgaWYoIXNjYW5uZWQpe1xuICAgICAgICBzY2FubmVkID0gbmV3IFdlYWtTZXQoKTtcbiAgICB9XG5cbiAgICBpZihzY2FubmVkLmhhcyhvYmplY3QpKXtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHNjYW5uZWQuYWRkKG9iamVjdCk7XG5cbiAgICB2YXIgaXNOZXcgPSBsYXN0SW5mby5vY2N1cmFuY2VzID09PSBmYWxzZSAmJiBvYmplY3QgIT09IHNjb3BlLnN0YXRlO1xuXG4gICAgaWYoaXNOZXcpe1xuICAgICAgICBsYXN0SW5mby5vY2N1cmFuY2VzID0gMDtcbiAgICB9XG5cbiAgICB2YXIgY2hhbmdlcyA9IFtdO1xuICAgIGdldFJlbW92ZWRDaGFuZ2VzKHNjb3BlLCBjaGFuZ2VzLCBsYXN0SW5mbywgb2JqZWN0KTtcbiAgICBnZXRDdXJyZW50Q2hhbmdlcyhzY29wZSwgY2hhbmdlcywgbGFzdEluZm8sIG9iamVjdCwgc2Nhbm5lZCwgaW5zdGFuY2VDaGFuZ2VzKTtcblxuICAgIGlmKGlzTmV3KXtcbiAgICAgICAgaW5zdGFuY2VDaGFuZ2VzLnB1c2goW2xhc3RJbmZvLmlkLCBjcmVhdGVJbnN0YW5jZURlZmluaXRpb24oc2NvcGUsIG9iamVjdCldKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBpbnN0YW5jZUNoYW5nZXM6IGluc3RhbmNlQ2hhbmdlcyxcbiAgICAgICAgY2hhbmdlczogY2hhbmdlc1xuICAgIH07XG59XG5cbmZ1bmN0aW9uIGNoYW5nZXMoKXtcbiAgICB2YXIgc2NvcGUgPSB0aGlzLFxuICAgICAgICByZXN1bHQgPSBnZXRPYmplY3RDaGFuZ2VzKHNjb3BlLCBzY29wZS5zdGF0ZSk7XG5cbiAgICB2YXIgaW5zdGFuY2VDaGFuZ2VzID0gT2JqZWN0LmtleXMoc2NvcGUuaW5zdGFuY2VzKS5yZWR1Y2UoZnVuY3Rpb24oY2hhbmdlcywga2V5KXtcbiAgICAgICAgdmFyIGluc3RhbmNlID0gc2NvcGUuaW5zdGFuY2VzW2tleV0sXG4gICAgICAgICAgICBpdGVtSW5mbyA9IHNjb3BlLnRyYWNrZWRNYXAuZ2V0KGluc3RhbmNlKTtcblxuICAgICAgICBpZihpbnN0YW5jZSAhPT0gc2NvcGUuc3RhdGUgJiYgIWl0ZW1JbmZvLm9jY3VyYW5jZXMpe1xuICAgICAgICAgICAgc2NvcGUudHJhY2tlZE1hcC5kZWxldGUoaW5zdGFuY2UpO1xuICAgICAgICAgICAgZGVsZXRlIHNjb3BlLmluc3RhbmNlc1tpdGVtSW5mby5pZF07XG4gICAgICAgICAgICBjaGFuZ2VzLnB1c2goW2l0ZW1JbmZvLmlkLCAnciddKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBjaGFuZ2VzO1xuICAgIH0sIFtdKTtcblxuICAgIHJldHVybiBbcmVzdWx0Lmluc3RhbmNlQ2hhbmdlcy5jb25jYXQoaW5zdGFuY2VDaGFuZ2VzKV0uY29uY2F0KHJlc3VsdC5jaGFuZ2VzKTtcbn1cblxuZnVuY3Rpb24gZ2V0U3RhdGUoKXtcbiAgICB2YXIgc2NvcGUgPSB0aGlzO1xuXG4gICAgc2NvcGUudmlzY291cy5jaGFuZ2VzKCk7XG5cbiAgICByZXR1cm4gW09iamVjdC5rZXlzKHNjb3BlLmluc3RhbmNlcykucmV2ZXJzZSgpLm1hcChmdW5jdGlvbihrZXkpe1xuICAgICAgICByZXR1cm4gW2tleSwgY3JlYXRlSW5zdGFuY2VEZWZpbml0aW9uKHNjb3BlLCBzY29wZS5pbnN0YW5jZXNba2V5XSldO1xuICAgIH0pXTtcbn1cblxuZnVuY3Rpb24gYXBwbHlSb290Q2hhbmdlKHNjb3BlLCBuZXdTdGF0ZSl7XG4gICAgZm9yKHZhciBrZXkgaW4gc2NvcGUuc3RhdGUpe1xuICAgICAgICBpZigha2V5IGluIG5ld1N0YXRlKXtcbiAgICAgICAgICAgIGRlbGV0ZSBzY29wZS5zdGF0ZVtrZXldO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZvcih2YXIga2V5IGluIG5ld1N0YXRlKXtcbiAgICAgICAgc2NvcGUuc3RhdGVba2V5XSA9IG5ld1N0YXRlW2tleV07XG4gICAgfVxufVxuXG5mdW5jdGlvbiBpbmZsYXRlRGVmaW5pdGlvbihzY29wZSwgZGVmaW5pdGlvbil7XG4gICAgZm9yKHZhciBrZXkgaW4gZGVmaW5pdGlvbil7XG4gICAgICAgIGlmKEFycmF5LmlzQXJyYXkoZGVmaW5pdGlvbltrZXldKSl7XG4gICAgICAgICAgICBkZWZpbml0aW9uW2tleV0gPSBzY29wZS52aXNjb3VzLmdldEluc3RhbmNlKGRlZmluaXRpb25ba2V5XSk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFwcGx5KGNoYW5nZXMpe1xuICAgIHZhciBzY29wZSA9IHRoaXMsXG4gICAgICAgIGluc3RhbmNlQ2hhbmdlcyA9IGNoYW5nZXNbMF07XG5cbiAgICBpbnN0YW5jZUNoYW5nZXMuZm9yRWFjaChmdW5jdGlvbihpbnN0YW5jZUNoYW5nZSl7XG4gICAgICAgIGlmKGluc3RhbmNlQ2hhbmdlWzFdID09PSAncicpe1xuICAgICAgICAgICAgdmFyIGluc3RhbmNlID0gc2NvcGUuaW5zdGFuY2VzW2luc3RhbmNlQ2hhbmdlWzBdXTtcbiAgICAgICAgICAgIHNjb3BlLnRyYWNrZWRNYXAuZGVsZXRlKGluc3RhbmNlKTtcbiAgICAgICAgICAgIGRlbGV0ZSBzY29wZS5pbnN0YW5jZXNbaW5zdGFuY2VDaGFuZ2VbMF1dO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIGlmKHNjb3BlLmluc3RhbmNlc1tpbnN0YW5jZUNoYW5nZVswXV0gPT09IHNjb3BlLnN0YXRlKXtcbiAgICAgICAgICAgICAgICBpbmZsYXRlRGVmaW5pdGlvbihzY29wZSwgaW5zdGFuY2VDaGFuZ2VbMV0pO1xuICAgICAgICAgICAgICAgIGFwcGx5Um9vdENoYW5nZShzY29wZSwgaW5zdGFuY2VDaGFuZ2VbMV0pO1xuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgaW5mbGF0ZURlZmluaXRpb24oc2NvcGUsIGluc3RhbmNlQ2hhbmdlWzFdKTtcbiAgICAgICAgICAgICAgICBjcmVhdGVJbnN0YW5jZUluZm8oc2NvcGUsIGluc3RhbmNlQ2hhbmdlWzBdLCBpbnN0YW5jZUNoYW5nZVsxXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGZvcih2YXIgaSA9IDE7IGkgPCBjaGFuZ2VzLmxlbmd0aDsgaSsrKXtcbiAgICAgICAgdmFyIGNoYW5nZSA9IGNoYW5nZXNbaV07XG5cbiAgICAgICAgaWYoY2hhbmdlWzJdID09PSAncicpe1xuICAgICAgICAgICAgZGVsZXRlIHNjb3BlLmluc3RhbmNlc1tjaGFuZ2VbMF1dW2NoYW5nZVsxXV07XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgdmFyIHZhbHVlID0gY2hhbmdlWzNdO1xuXG4gICAgICAgICAgICBpZihBcnJheS5pc0FycmF5KGNoYW5nZVszXSkpe1xuICAgICAgICAgICAgICAgIHZhbHVlID0gc2NvcGUuaW5zdGFuY2VzW2NoYW5nZVszXV07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHNjb3BlLmluc3RhbmNlc1tjaGFuZ2VbMF1dW2NoYW5nZVsxXV0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZ2V0SW5zdGFuY2VCeUlkKGlkKXtcbiAgICByZXR1cm4gdGhpcy5pbnN0YW5jZXNbaWRdO1xufVxuXG5mdW5jdGlvbiB2aXNjb3VzKHN0YXRlKXtcbiAgICB2YXIgdmlzY291cyA9IHt9O1xuXG4gICAgdmFyIHNjb3BlID0ge1xuICAgICAgICB2aXNjb3VzLCB2aXNjb3VzLFxuICAgICAgICBjdXJyZW50SWQ6IDAsXG4gICAgICAgIHN0YXRlOiBzdGF0ZSB8fCB7fSxcbiAgICAgICAgdHJhY2tlZE1hcDogbmV3IFdlYWtNYXAoKSxcbiAgICAgICAgaW5zdGFuY2VzOiB7fVxuICAgIH07XG5cbiAgICAvLyBzZXRJbnRlcnZhbChmdW5jdGlvbigpe1xuICAgIC8vICAgICBjb25zb2xlLmxvZygodHlwZW9mIGRvY3VtZW50KS5jaGFyQXQoMCksIHNjb3BlLmluc3RhbmNlcyk7XG4gICAgLy8gfSwgMTAwMCk7XG5cbiAgICBzY29wZS5nZXRJZCA9IGdldElkLmJpbmQoc2NvcGUpO1xuXG4gICAgdmlzY291cy5jaGFuZ2VzID0gY2hhbmdlcy5iaW5kKHNjb3BlKTtcbiAgICB2aXNjb3VzLmFwcGx5ID0gYXBwbHkuYmluZChzY29wZSk7XG4gICAgdmlzY291cy5zdGF0ZSA9IGdldFN0YXRlLmJpbmQoc2NvcGUpO1xuICAgIHZpc2NvdXMuZ2V0SWQgPSBnZXRJbnN0YW5jZUlkLmJpbmQoc2NvcGUpO1xuICAgIHZpc2NvdXMuZ2V0SW5zdGFuY2UgPSBnZXRJbnN0YW5jZUJ5SWQuYmluZChzY29wZSk7XG5cbiAgICB2aXNjb3VzLmNoYW5nZXMoKTtcblxuICAgIHJldHVybiB2aXNjb3VzO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHZpc2NvdXM7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzU2FtZShhLCBiKXtcbiAgICBpZihhID09PSBiKXtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYoXG4gICAgICAgIHR5cGVvZiBhICE9PSB0eXBlb2YgYiB8fFxuICAgICAgICB0eXBlb2YgYSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgIShhIGluc3RhbmNlb2YgRGF0ZSAmJiBiIGluc3RhbmNlb2YgRGF0ZSlcbiAgICApe1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIFN0cmluZyhhKSA9PT0gU3RyaW5nKGIpO1xufTsiLCJcbnZhciB2aXNjb3VzID0gcmVxdWlyZSgnLi4vJyk7XG5cbnZhciBzdGF0ZTEgPSB7fSxcbiAgICBkaWZmZXIxID0gdmlzY291cyhzdGF0ZTEpO1xuXG52YXIgc3RhdGUyID0ge30sXG4gICAgZGlmZmVyMiA9IHZpc2NvdXMoc3RhdGUyKTtcblxudmFyIHJ1biA9IHNldEludGVydmFsKGZ1bmN0aW9uKCl7XG5cbiAgICB2YXIgY2hhbmd5bmVzcyA9IE1hdGgucmFuZG9tKCkgKiA1O1xuXG4gICAgZm9yKHZhciBpID0gMDsgaSA8IDEwMDsgaSsrKXtcbiAgICAgICAgc3RhdGUxW2ldID0gc3RhdGUxW2ldIHx8IHt9O1xuICAgICAgICBmb3IodmFyIGogPSAwOyBqIDwgMTAwOyBqKyspe1xuICAgICAgICAgICAgc3RhdGUxW2ldW2pdID0gc3RhdGUxW2ldW2pdIHx8IHt9O1xuICAgICAgICAgICAgc3RhdGUxW2ldW2pdLmEgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBjaGFuZ3luZXNzKTtcbiAgICAgICAgICAgIGlmKCFNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMCkpe1xuICAgICAgICAgICAgICAgIHN0YXRlMVtpXVtqXS5iID0ge307XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgbm93ID0gRGF0ZS5ub3coKTtcbiAgICB2YXIgY2hhbmdlcyA9IGRpZmZlcjEuY2hhbmdlcygpO1xuICAgIGNvbnNvbGUubG9nKERhdGUubm93KCkgLSBub3csIGNoYW5nZXMubGVuZ3RoKTtcbiAgICBkaWZmZXIyLmFwcGx5KGNoYW5nZXMpO1xuICAgIGNvbnNvbGUubG9nKERhdGUubm93KCkgLSBub3cpO1xufSwgMTAwKTtcblxuc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgIGNsZWFySW50ZXJ2YWwocnVuKTtcbn0sIDQwMDApOyJdfQ==
