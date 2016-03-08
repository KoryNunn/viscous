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

function getObjectChanges(scope, object, scanned){
    var lastInfo = scope.trackedMap.get(object),
        oldKeys,
        currentKeys = Object.keys(object),
        newKeys,
        removedKeys,
        instanceChanges = [];

    scanned = scanned || new WeakSet();

    if(scanned.has(object)){
        return {
            instanceChanges: instanceChanges,
            changes: [],
            id: lastInfo.id
        }
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

    var changes = (
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
        }, [])
    )
    .concat(
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

                change.push([valueChanges.id]);

                result.push.apply(result, valueChanges.changes);
                instanceChanges.push.apply(instanceChanges, valueChanges.instanceChanges);
            }

            if(changed){
                result.push(change);
            }

            return result;
        }, [])
    );

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
