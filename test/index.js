var test = require('tape'),
    viscous = require('../');

test('simple', function(t){

    t.plan(1);

    var a = {},
        b = {},
        differ1 = viscous(a),
        differ2 = viscous(b);

    a.x = 1;

    differ2.apply(differ1.changes());

    t.deepEqual(b, a);
});

test('child instances', function(t){

    t.plan(2);

    var a = {},
        b = {},
        differ1 = viscous(a),
        differ2 = viscous(b);

    a.x = {};

    differ2.apply(differ1.changes());

    t.deepEqual(b, a);

    a.y = 5;

    differ2.apply(differ1.changes());

    t.deepEqual(b, a);

});

test('child instances no extra changes', function(t){

    t.plan(2);

    var a = {},
        b = {},
        differ1 = viscous(a),
        differ2 = viscous(b);

    a.x = {};

    differ2.apply(differ1.changes());

    t.deepEqual(b, a);

    t.deepEqual(differ1.changes(), [[]]);

});

test('deep instances', function(t){

    t.plan(1);

    var a = {},
        b = {},
        differ1 = viscous(a),
        differ2 = viscous(b);

    a.x = {};
    a.x.y = {};

    differ2.apply(differ1.changes());

    t.deepEqual(b, a);

});

test('instance removed', function(t){

    t.plan(2);

    var a = {},
        b = {},
        differ1 = viscous(a),
        differ2 = viscous(b);

    a.x = {};

    differ2.apply(differ1.changes());

    t.deepEqual(b, a);

    delete a.x;

    differ2.apply(differ1.changes());

    t.deepEqual(b, a);

});

test('deep instances removed', function(t){

    t.plan(2);

    var a = {},
        b = {},
        differ1 = viscous(a),
        differ2 = viscous(b);

    a.x = {};
    a.x.y = {};

    differ2.apply(differ1.changes());

    t.deepEqual(b, a);

    delete a.x;

    differ2.apply(differ1.changes());

    t.deepEqual(b, a);

});

test('deep instances removed only parent', function(t){

    t.plan(2);

    var ac = {};

    var ab = {c:ac};

    var a = {b:ab,c:ac},
        b = {},
        differ1 = viscous(a),
        differ2 = viscous(b);

    differ2.apply(differ1.state());

    delete a.b;

    differ2.apply(differ1.changes());

    t.deepEqual(b, a);

    delete a.c;

    differ2.apply(differ1.changes());

    t.deepEqual(b, a);

});

test('instance removed and added', function(t){

    t.plan(2);

    var a = {},
        b = {},
        differ1 = viscous(a),
        differ2 = viscous(b);

    differ2.apply(differ1.changes());

    t.deepEqual(b, a);

    delete a.x;
    a.x = {};

    differ2.apply(differ1.changes());

    t.deepEqual(b, a);

});

test('functions', function(t){

    t.plan(1);

    var a = {},
        b = {},
        differ1 = viscous(a),
        differ2 = viscous(b);

    a.x = function(){
        return 20;
    };
    a.x.y = {};

    differ2.apply(differ1.changes());

    t.deepEqual(b.x(), a.x());
});

test('function replication', function(t){

    t.plan(2);

    var a = {b:{}},
        b = {},
        differ = viscous(a),
        differ2 = viscous(b);

    differ2.apply(differ.state());

    var fn1 = function(){
        t.pass('first function called');
    };

    var fn2 = function(){
        t.pass('second function called');
    };

    a.b = fn1;

    differ2.apply(differ.changes());

    b.b();

    a.b = fn2;

    differ2.apply(differ.changes());

    b.b();

});

test('deep function replication', function(t){

    t.plan(1);

    var a = {b:{}},
        b = {},
        differ = viscous(a),
        differ2 = viscous(b);

    differ2.apply(differ.state());

    a.b = function(){
        t.fail('function 1 called');
    };

    differ2.apply(differ.changes());

    a.b = function(){
        t.pass('function 2 called');
    };

    differ2.apply(differ.changes());

    b.b();

});

test('arrays', function(t){

    t.plan(2);

    var a = {},
        b = {},
        differ1 = viscous(a),
        differ2 = viscous(b);

    var obj = {};

    a.x = [obj, 1];

    differ2.apply(differ1.changes());

    t.deepEqual(b, a);

    a.x.shift();
    a.x.push(obj);

    differ2.apply(differ1.changes());

    t.deepEqual(b, a);

});

test('arrays with instances', function(t){

    t.plan(1);

    var a = {x:[{},{},{}]},
        b = {},
        differ1 = viscous(a),
        differ2 = viscous(b);

    a.x = a.x.slice();

    differ2.apply(differ1.state());

    t.deepEqual(b, a);

});

test('array modification', function(t){

    t.plan(1);

    var a = {x:[1,2,3,4]},
        b = {},
        differ1 = viscous(a),
        differ2 = viscous(b);

    a.x.splice(1, 1);

    differ2.apply(differ1.state());

    t.deepEqual(b, a);

});

test('array properties', function(t){

    t.plan(1);

    var a = {x:[]};

    a.x.y = 'y';

    var b = {},
        differ1 = viscous(a),
        differ2 = viscous(b);

    differ2.apply(differ1.state());

    t.deepEqual(b, a);
});

test('dates', function(t){

    t.plan(1);

    var a = {x:new Date(2016,1,1)},
        b = {},
        differ1 = viscous(a),
        differ2 = viscous(b);

    differ2.apply(differ1.state());

    t.deepEqual(b, a);
});

test('state', function(t){

    t.plan(1);

    var a = {},
        b = {},
        differ1 = viscous(a),
        differ2 = viscous(b);

    a.x = {};
    a.x.y = {};

    differ2.apply(differ1.state());

    t.deepEqual(b, a);

});

test('apply changes', function(t){

    t.plan(2);

    var a = {},
        differ1 = viscous(a);

    a.x = {};
    a.x.y = a.x;
    a.z = new Date(2016,1,1);

    var b = {},
        differ2 = viscous(b);

    differ2.apply(differ1.changes());

    t.equal(b.x, b.x.y);
    t.equal(b.z.toString(), new Date(2016,1,1).toString());
});

test('apply cyclic changes', function(t){

    t.plan(2);

    var foo = [];
    var bar = {foo:foo};
    foo.push(bar);

    var source = {foo: foo};
    var target = {};

    var differ1 = viscous(source);
    var differ2 = viscous(target);

    differ2.apply(differ1.state());

    t.ok(target.foo);
    t.equal(target.foo, target.foo[0].foo);

});

test('apply changes via stringify', function(t){

    t.plan(3);

    var a = {},
        differ = viscous(a);

    a.x = {};
    a.x.y = a.x;

    var b = {},
        differ2 = viscous(b);

    var changes = JSON.parse(JSON.stringify(differ.changes()));

    differ2.apply(changes);

    t.ok(b.x);
    t.ok(b.x.y);
    t.equal(b.x, b.x.y);

});

test('serialiser/deserialisers', function(t){
    var EventEmitter = require('events');

    function serialise(value){
        if(value instanceof EventEmitter){
            return [{}, 'e'];
        }
    }

    function deserialise(definition){
        if(definition[1] === 'e'){
            return new EventEmitter();
        }
    }

    t.plan(1);

    var a = {x: new EventEmitter()},
        differ = viscous(a, {
            serialiser: serialise,
            deserialiser: deserialise
        });

    var b = {},
        differ2 = viscous(b, {
            serialiser: serialise,
            deserialiser: deserialise
        });

    differ2.apply(differ.state());

    t.ok(b.x instanceof EventEmitter);

});

test('describe/inflate', function(t){

    t.plan(3);

    var baz = {majigger: 'whatsits'},
        thing = {
        foo: {
            bar: 1,
            baz: baz,
            majigger: baz
        },
        baz: baz
    };

    var differ = viscous(thing);

    t.equal(differ.inflate(differ.describe(thing.foo)), thing.foo);
    t.equal(differ.inflate(differ.describe(1)), 1);
    t.equal(differ.inflate(differ.describe({foo: thing.foo})).foo, thing.foo);

});