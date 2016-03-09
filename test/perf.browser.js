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
    var lastInfo = scope.trackedMap.get(object),
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
    }

    var changes = [];
    getRemovedChanges(scope, changes, lastInfo, object);
    getCurrentChanges(scope, changes, lastInfo, object, scanned, instanceChanges);

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy5udm0vdmVyc2lvbnMvbm9kZS92NS4zLjAvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiaW5kZXguanMiLCJub2RlX21vZHVsZXMvc2FtZS12YWx1ZS9pbmRleC5qcyIsInRlc3QvcGVyZi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBzYW1lID0gcmVxdWlyZSgnc2FtZS12YWx1ZScpO1xuXG5mdW5jdGlvbiBpc0luc3RhbmNlKHZhbHVlKXtcbiAgICB2YXIgdHlwZSA9IHR5cGVvZiB2YWx1ZTtcbiAgICByZXR1cm4gdHlwZSA9PT0gJ29iamVjdCcgfHwgdHlwZSA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZnVuY3Rpb24gZ2V0SWQoKXtcbiAgICByZXR1cm4gKHRoaXMuY3VycmVudElkKyspLnRvU3RyaW5nKDM2KTtcbn1cblxuZnVuY3Rpb24gb2JqZWN0UmVtb3ZlZENoYW5nZXMoc2NvcGUsIG9iamVjdCl7XG4gICAgdmFyIGl0ZW1JbmZvID0gc2NvcGUudHJhY2tlZE1hcC5nZXQob2JqZWN0KTtcblxuICAgIGl0ZW1JbmZvLm9jY3VyYW5jZXMtLTtcblxuICAgIGZvcihrZXkgaW4gb2JqZWN0KXtcbiAgICAgICAgaWYoaXNJbnN0YW5jZShvYmplY3Rba2V5XSkpe1xuICAgICAgICAgICAgb2JqZWN0UmVtb3ZlZENoYW5nZXMoc2NvcGUsIG9iamVjdFtrZXldKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZ2V0UmVtb3ZlZENoYW5nZShzY29wZSwgY2hhbmdlcywgbGFzdEluZm8sIG9iamVjdCwgb2xkS2V5KXtcbiAgICBpZighKG9sZEtleSBpbiBvYmplY3QpKXtcbiAgICAgICAgdmFyIG9sZFZhbHVlID0gbGFzdEluZm8ubGFzdFN0YXRlW29sZEtleV07XG4gICAgICAgIGNoYW5nZXMucHVzaChbbGFzdEluZm8uaWQsIG9sZEtleSwgJ3InXSk7XG5cbiAgICAgICAgaWYoaXNJbnN0YW5jZShvbGRWYWx1ZSkgJiYgc2NvcGUudHJhY2tlZE1hcC5oYXMob2xkVmFsdWUpKXtcbiAgICAgICAgICAgIG9iamVjdFJlbW92ZWRDaGFuZ2VzKHNjb3BlLCBvbGRWYWx1ZSk7XG4gICAgICAgIH1cblxuICAgICAgICBkZWxldGUgbGFzdEluZm8ubGFzdFN0YXRlW29sZEtleV07XG4gICAgfVxufVxuXG5mdW5jdGlvbiBnZXRSZW1vdmVkQ2hhbmdlcyhzY29wZSwgY2hhbmdlcywgbGFzdEluZm8sIG9iamVjdCl7XG4gICAgZm9yKHZhciBvbGRLZXkgaW4gbGFzdEluZm8ubGFzdFN0YXRlKXtcbiAgICAgICAgZ2V0UmVtb3ZlZENoYW5nZShzY29wZSwgY2hhbmdlcywgbGFzdEluZm8sIG9iamVjdCwgb2xkS2V5KTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdldEN1cnJlbnRDaGFuZ2Uoc2NvcGUsIGNoYW5nZXMsIGxhc3RJbmZvLCBvYmplY3QsIGN1cnJlbnRLZXksIHNjYW5uZWQsIGluc3RhbmNlQ2hhbmdlcyl7XG4gICAgdmFyIHR5cGUgPSBjdXJyZW50S2V5IGluIGxhc3RJbmZvLmxhc3RTdGF0ZSA/ICdlJyA6ICdhJyxcbiAgICAgICAgb2xkVmFsdWUgPSBsYXN0SW5mby5sYXN0U3RhdGVbY3VycmVudEtleV0sXG4gICAgICAgIGN1cnJlbnRWYWx1ZSA9IG9iamVjdFtjdXJyZW50S2V5XSxcbiAgICAgICAgY2hhbmdlID0gW2xhc3RJbmZvLmlkLCBjdXJyZW50S2V5LCB0eXBlXSxcbiAgICAgICAgY2hhbmdlZCA9ICFzYW1lKG9sZFZhbHVlLCBjdXJyZW50VmFsdWUpO1xuXG4gICAgaWYoY2hhbmdlZCl7XG4gICAgICAgIGlmKGlzSW5zdGFuY2Uob2xkVmFsdWUpICYmIHNjb3BlLnRyYWNrZWRNYXAuaGFzKG9sZFZhbHVlKSl7XG4gICAgICAgICAgICBvYmplY3RSZW1vdmVkQ2hhbmdlcyhzY29wZSwgb2xkVmFsdWUpO1xuICAgICAgICB9XG4gICAgfWVsc2V7XG4gICAgICAgIC8vIFByZXZpb3VzbHkgbm8ga2V5LCBub3cga2V5LCBidXQgdmFsdWUgaXMgdW5kZWZpbmVkLlxuICAgICAgICBpZih0eXBlID09PSAnYScpe1xuICAgICAgICAgICAgY2hhbmdlcy5wdXNoKGNoYW5nZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBsYXN0SW5mby5sYXN0U3RhdGVbY3VycmVudEtleV0gPSBjdXJyZW50VmFsdWU7XG5cbiAgICBpZighaXNJbnN0YW5jZShjdXJyZW50VmFsdWUpKXtcbiAgICAgICAgY2hhbmdlLnB1c2goY3VycmVudFZhbHVlKTtcbiAgICB9ZWxzZXtcbiAgICAgICAgdmFyIHZhbHVlQ2hhbmdlcyA9IGdldE9iamVjdENoYW5nZXMoc2NvcGUsIGN1cnJlbnRWYWx1ZSwgc2Nhbm5lZCksXG4gICAgICAgICAgICB2YWx1ZUluZm8gPSBzY29wZS50cmFja2VkTWFwLmdldChjdXJyZW50VmFsdWUpO1xuXG4gICAgICAgIHZhbHVlSW5mby5vY2N1cmFuY2VzKys7XG4gICAgICAgIGNoYW5nZS5wdXNoKFt2YWx1ZUluZm8uaWRdKTtcblxuICAgICAgICBpZih2YWx1ZUNoYW5nZXMpe1xuICAgICAgICAgICAgY2hhbmdlcy5wdXNoLmFwcGx5KGNoYW5nZXMsIHZhbHVlQ2hhbmdlcy5jaGFuZ2VzKTtcbiAgICAgICAgICAgIGluc3RhbmNlQ2hhbmdlcy5wdXNoLmFwcGx5KGluc3RhbmNlQ2hhbmdlcywgdmFsdWVDaGFuZ2VzLmluc3RhbmNlQ2hhbmdlcyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZihjaGFuZ2VkKXtcbiAgICAgICAgY2hhbmdlcy5wdXNoKGNoYW5nZSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBnZXRDdXJyZW50Q2hhbmdlcyhzY29wZSwgY2hhbmdlcywgbGFzdEluZm8sIG9iamVjdCwgc2Nhbm5lZCwgaW5zdGFuY2VDaGFuZ2VzKXtcbiAgICBmb3IodmFyIGN1cnJlbnRLZXkgaW4gb2JqZWN0KXtcbiAgICAgICAgZ2V0Q3VycmVudENoYW5nZShzY29wZSwgY2hhbmdlcywgbGFzdEluZm8sIG9iamVjdCwgY3VycmVudEtleSwgc2Nhbm5lZCwgaW5zdGFuY2VDaGFuZ2VzKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdldE9iamVjdENoYW5nZXMoc2NvcGUsIG9iamVjdCwgc2Nhbm5lZCl7XG4gICAgdmFyIGxhc3RJbmZvID0gc2NvcGUudHJhY2tlZE1hcC5nZXQob2JqZWN0KSxcbiAgICAgICAgbmV3S2V5cyxcbiAgICAgICAgcmVtb3ZlZEtleXMsXG4gICAgICAgIGluc3RhbmNlQ2hhbmdlcyA9IFtdO1xuXG4gICAgaWYoIXNjYW5uZWQpe1xuICAgICAgICBzY2FubmVkID0gbmV3IFdlYWtTZXQoKTtcbiAgICB9XG5cbiAgICBpZihzY2FubmVkLmhhcyhvYmplY3QpKXtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHNjYW5uZWQuYWRkKG9iamVjdCk7XG5cbiAgICBpZighbGFzdEluZm8pe1xuICAgICAgICBsYXN0SW5mbyA9IHtcbiAgICAgICAgICAgIGlkOiBzY29wZS5nZXRJZCgpLFxuICAgICAgICAgICAgaW5zdGFuY2U6IG9iamVjdCxcbiAgICAgICAgICAgIGxhc3RTdGF0ZToge30sXG4gICAgICAgICAgICBvY2N1cmFuY2VzOiAwXG4gICAgICAgIH07XG4gICAgICAgIHNjb3BlLmluc3RhbmNlc1tsYXN0SW5mby5pZF0gPSBvYmplY3Q7XG4gICAgICAgIHNjb3BlLnRyYWNrZWRNYXAuc2V0KG9iamVjdCwgbGFzdEluZm8pO1xuXG4gICAgICAgIGluc3RhbmNlQ2hhbmdlcy5wdXNoKFtsYXN0SW5mby5pZCwgb2JqZWN0XSk7XG4gICAgfVxuXG4gICAgdmFyIGNoYW5nZXMgPSBbXTtcbiAgICBnZXRSZW1vdmVkQ2hhbmdlcyhzY29wZSwgY2hhbmdlcywgbGFzdEluZm8sIG9iamVjdCk7XG4gICAgZ2V0Q3VycmVudENoYW5nZXMoc2NvcGUsIGNoYW5nZXMsIGxhc3RJbmZvLCBvYmplY3QsIHNjYW5uZWQsIGluc3RhbmNlQ2hhbmdlcyk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBpbnN0YW5jZUNoYW5nZXM6IGluc3RhbmNlQ2hhbmdlcyxcbiAgICAgICAgY2hhbmdlczogY2hhbmdlc1xuICAgIH07XG59XG5cbmZ1bmN0aW9uIGNoYW5nZXMoKXtcbiAgICB2YXIgc2NvcGUgPSB0aGlzLFxuICAgICAgICByZXN1bHQgPSBnZXRPYmplY3RDaGFuZ2VzKHNjb3BlLCBzY29wZS5zdGF0ZSk7XG5cbiAgICB2YXIgaW5zdGFuY2VDaGFuZ2VzID0gT2JqZWN0LmtleXMoc2NvcGUuaW5zdGFuY2VzKS5yZWR1Y2UoZnVuY3Rpb24oY2hhbmdlcywga2V5KXtcbiAgICAgICAgdmFyIGluc3RhbmNlID0gc2NvcGUuaW5zdGFuY2VzW2tleV0sXG4gICAgICAgICAgICBpdGVtSW5mbyA9IHNjb3BlLnRyYWNrZWRNYXAuZ2V0KGluc3RhbmNlKTtcblxuICAgICAgICBpZihpbnN0YW5jZSAhPT0gc2NvcGUuc3RhdGUgJiYgIWl0ZW1JbmZvLm9jY3VyYW5jZXMpe1xuICAgICAgICAgICAgc2NvcGUudHJhY2tlZE1hcC5kZWxldGUoaW5zdGFuY2UpO1xuICAgICAgICAgICAgZGVsZXRlIHNjb3BlLmluc3RhbmNlc1tpdGVtSW5mby5pZF07XG4gICAgICAgICAgICBjaGFuZ2VzLnB1c2goW2l0ZW1JbmZvLmlkLCAnciddKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBjaGFuZ2VzO1xuICAgIH0sIFtdKTtcblxuICAgIHJldHVybiBbcmVzdWx0Lmluc3RhbmNlQ2hhbmdlcy5jb25jYXQoaW5zdGFuY2VDaGFuZ2VzKV0uY29uY2F0KHJlc3VsdC5jaGFuZ2VzKTtcbn1cblxuZnVuY3Rpb24gZ2V0U3RhdGUoKXtcbiAgICB2YXIgc3RhdGUgPSB0aGlzO1xuXG4gICAgc3RhdGUudmlzY291cy5jaGFuZ2VzKCk7XG5cbiAgICByZXR1cm4gT2JqZWN0LmtleXMoc3RhdGUuaW5zdGFuY2VzKS5tYXAoZnVuY3Rpb24oa2V5KXtcbiAgICAgICAgcmV0dXJuIFtrZXksIHN0YXRlLmluc3RhbmNlc1trZXldXTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gYXBwbHkoY2hhbmdlcyl7XG4gICAgdmFyIHNjb3BlID0gdGhpcyxcbiAgICAgICAgaW5zdGFuY2VDaGFuZ2VzID0gY2hhbmdlc1swXTtcblxuICAgIGluc3RhbmNlQ2hhbmdlcy5mb3JFYWNoKGZ1bmN0aW9uKGluc3RhbmNlQ2hhbmdlKXtcbiAgICAgICAgaWYoaW5zdGFuY2VDaGFuZ2VbMV0gPT09ICdyJyl7XG4gICAgICAgICAgICBkZWxldGUgc2NvcGUuaW5zdGFuY2VzW2luc3RhbmNlQ2hhbmdlWzBdXTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBzY29wZS5pbnN0YW5jZXNbaW5zdGFuY2VDaGFuZ2VbMF1dID0gaW5zdGFuY2VDaGFuZ2VbMV07XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGZvcih2YXIgaSA9IDE7IGkgPCBjaGFuZ2VzLmxlbmd0aDsgaSsrKXtcbiAgICAgICAgdmFyIGNoYW5nZSA9IGNoYW5nZXNbaV07XG5cbiAgICAgICAgaWYoY2hhbmdlWzJdID09PSAncicpe1xuICAgICAgICAgICAgZGVsZXRlIHNjb3BlLmluc3RhbmNlc1tjaGFuZ2VbMF1dW2NoYW5nZVsxXV07XG4gICAgICAgIH1lbHNle1xuICAgICAgICAgICAgdmFyIHZhbHVlID0gY2hhbmdlWzNdO1xuXG4gICAgICAgICAgICBpZihBcnJheS5pc0FycmF5KGNoYW5nZVszXSkpe1xuICAgICAgICAgICAgICAgIHZhbHVlID0gc2NvcGUuaW5zdGFuY2VzW2NoYW5nZVszXV07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHNjb3BlLmluc3RhbmNlc1tjaGFuZ2VbMF1dW2NoYW5nZVsxXV0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gdmlzY291cyhzdGF0ZSl7XG4gICAgdmFyIHZpc2NvdXMgPSB7fTtcblxuICAgIHZhciBzY29wZSA9IHtcbiAgICAgICAgdmlzY291cywgdmlzY291cyxcbiAgICAgICAgY3VycmVudElkOiAwLFxuICAgICAgICBzdGF0ZTogc3RhdGUgfHwge30sXG4gICAgICAgIHRyYWNrZWRNYXA6IG5ldyBXZWFrTWFwKCksXG4gICAgICAgIGluc3RhbmNlczoge31cbiAgICB9O1xuXG4gICAgc2NvcGUuZ2V0SWQgPSBnZXRJZC5iaW5kKHNjb3BlKTtcblxuICAgIHZpc2NvdXMuY2hhbmdlcyA9IGNoYW5nZXMuYmluZChzY29wZSk7XG4gICAgdmlzY291cy5hcHBseSA9IGFwcGx5LmJpbmQoc2NvcGUpO1xuICAgIHZpc2NvdXMuc3RhdGUgPSBnZXRTdGF0ZS5iaW5kKHNjb3BlKTtcblxuICAgIHZpc2NvdXMuY2hhbmdlcygpO1xuXG4gICAgcmV0dXJuIHZpc2NvdXM7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gdmlzY291cztcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNTYW1lKGEsIGIpe1xuICAgIGlmKGEgPT09IGIpe1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZihcbiAgICAgICAgdHlwZW9mIGEgIT09IHR5cGVvZiBiIHx8XG4gICAgICAgIHR5cGVvZiBhID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAhKGEgaW5zdGFuY2VvZiBEYXRlICYmIGIgaW5zdGFuY2VvZiBEYXRlKVxuICAgICl7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gU3RyaW5nKGEpID09PSBTdHJpbmcoYik7XG59OyIsIlxudmFyIHZpc2NvdXMgPSByZXF1aXJlKCcuLi8nKTtcblxudmFyIHN0YXRlMSA9IHt9LFxuICAgIGRpZmZlcjEgPSB2aXNjb3VzKHN0YXRlMSk7XG5cbnZhciBzdGF0ZTIgPSB7fSxcbiAgICBkaWZmZXIyID0gdmlzY291cyhzdGF0ZTIpO1xuXG52YXIgcnVuID0gc2V0SW50ZXJ2YWwoZnVuY3Rpb24oKXtcblxuICAgIHZhciBjaGFuZ3luZXNzID0gTWF0aC5yYW5kb20oKSAqIDU7XG5cbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgMTAwOyBpKyspe1xuICAgICAgICBzdGF0ZTFbaV0gPSBzdGF0ZTFbaV0gfHwge307XG4gICAgICAgIGZvcih2YXIgaiA9IDA7IGogPCAxMDA7IGorKyl7XG4gICAgICAgICAgICBzdGF0ZTFbaV1bal0gPSBzdGF0ZTFbaV1bal0gfHwge307XG4gICAgICAgICAgICBzdGF0ZTFbaV1bal0uYSA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGNoYW5neW5lc3MpO1xuICAgICAgICAgICAgaWYoIU1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwKSl7XG4gICAgICAgICAgICAgICAgc3RhdGUxW2ldW2pdLmIgPSB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHZhciBub3cgPSBEYXRlLm5vdygpO1xuICAgIHZhciBjaGFuZ2VzID0gZGlmZmVyMS5jaGFuZ2VzKCk7XG4gICAgY29uc29sZS5sb2coRGF0ZS5ub3coKSAtIG5vdywgY2hhbmdlcy5sZW5ndGgpO1xuICAgIGRpZmZlcjIuYXBwbHkoY2hhbmdlcyk7XG4gICAgY29uc29sZS5sb2coRGF0ZS5ub3coKSAtIG5vdyk7XG59LCAxMDApO1xuXG5zZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgY2xlYXJJbnRlcnZhbChydW4pO1xufSwgNDAwMCk7Il19
