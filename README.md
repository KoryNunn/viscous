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

## Goals

Fast. instance-tracked. Serialisable. Small serialised diff-size.