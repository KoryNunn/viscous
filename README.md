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

## Methods

### viscous.changes()

Returns a set of changes since the last time it was called.

### viscous.apply()

Applies a set of changes

### viscous.state()

Returns a set of changes that describes the current state.

### viscous.getId(instance)

returns the internal id of the instance, or undefined if the instance does not exist in `state`

### viscous.getInstance(id)

returns the instance for the given id, assuming it exists.

### viscous.describe(anything)

returns a description of anything, including information about ids of tracked instances.

### viscous.inflate(description)

inflates a description into whever was described, including instances that exist in `state`


## Extending serialisation

extended functionality can be added via the `serialiser` and `deserialiser` settings:

```javascript

function serialise(value){
    if(value instanceof EventEmitter){
        return [{}, 'emitter']; // MUST return an array of [anything, string type]
    }
}

function deserialise(definition){
    if(definition[1] === 'emitter'){
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

## Avoiding instance collisions.

You can pass a viscousId via settings, and all internal instance IDs will be prefixed with that.

I'm not super happy with this solution at the moment.

Good luck!

## Goals

Fast. instance-tracked. Serialisable. Small serialised diff-size.

## Caveats

viscous only looks at own properties, but if you need to handle prototypical properties, you can always use custom serialise/deserialisers
