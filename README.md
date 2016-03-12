# Viscous

serialisable appliable state differ

## Usage

```javascript
var viscous = require('viscous');

var state1 = {},
    differ1 = viscous(state1);

var state2 = {},
    differ2 = viscous(state2);

state1.x = 10; // assign a value
state1.y = state1; // assign an instance (in this case cyclic)

var changes = differ1.changes(); // -> unreadble arrays and stuff.

differ2.apply(changes);

// Now state2 is deepEqual to state1.
```

## Extending serialisation

extended functionality can be added via the `serialiser` and `deserialiser` settings:

```javascript

function serialise(value){
    if(value instanceof EventEmitter){
        return [{}, 'emitter']; // MUST return an array of [anything, string type]
    }
}

function deserialise(definition){
    if(definition[1] === 'e'){
        return new EventEmitter();
    }
}

var a = {x: new EventEmitter()},
    primary = viscous(a, {
        serialiser: serialise,
        deserialiser: deserialise
    });

var b = {},
    replicant = viscous(b, {
        serialiser: serialise,
        deserialiser: deserialise
    });

replicant.apply(primary.state());

b.x instanceof EventEmitter; // -> true
```

## Goals

Fast. instance-tracked. Serialisable. Small serialised diff-size.