var test = require('tape'),
    viscous = require('../');

test('simple', function(t){

    t.plan(1);

    var a = {},
        differ = viscous(a);

    a.x = 1;

    t.deepEqual(differ.changes(), [
        [],
        ['0', 'x','a', 1]
    ]);
});

test('child instances', function(t){

    t.plan(2);

    var a = {},
        differ = viscous(a);

    a.x = {};

    t.deepEqual(differ.changes(), [
        [
            ['1', [{}]]
        ],
        ['0', 'x','a', ['1']]
    ]);

    a.y = 5;

    t.deepEqual(differ.changes(), [
        [],
        ['0', 'y','a', 5]
    ]);

});

test('child instances no extra changes', function(t){

    t.plan(3);

    var a = {},
        differ = viscous(a);

    a.x = {};

    t.deepEqual(differ.changes(), [
        [
            ['1', [{}]]
        ],
        ['0', 'x','a', ['1']]
    ]);

    a.y = 5;

    t.deepEqual(differ.changes(), [
        [],
        ['0', 'y','a', 5]
    ]);

    t.deepEqual(differ.changes(), [[]]);

});

test('deep instances', function(t){

    t.plan(1);

    var a = {},
        differ = viscous(a);

    a.x = {};
    a.x.y = {};

    t.deepEqual(differ.changes(), [
        [
            ['2', [{}]],
            ['1', [{y: ['2']}]]
        ],
        ['0', 'x','a', ['1']],
        ['1', 'y','a', ['2']]
    ]);

});

test('instance removed', function(t){

    t.plan(2);

    var a = {},
        differ = viscous(a);

    a.x = {};

    t.deepEqual(differ.changes(), [
        [
            ['1', [{}]]
        ],
        ['0', 'x','a', ['1']]
    ]);

    delete a.x;

    t.deepEqual(differ.changes(), [
        [
            ['1', 'r']
        ],
        ['0', 'x','r']
    ]);

});

test('deep instances removed', function(t){

    t.plan(2);

    var a = {},
        differ = viscous(a);

    a.x = {};
    a.x.y = {};

    t.deepEqual(differ.changes(), [
        [
            ['2', [{}]],
            ['1', [{y: ['2']}]]
        ],
        ['0', 'x','a', ['1']],
        ['1', 'y','a', ['2']]
    ]);

    delete a.x;

    t.deepEqual(differ.changes(), [
        [
            ['1', 'r'],
            ['2', 'r']
        ],
        ['0', 'x','r']
    ]);

});

test('instance removed and added', function(t){

    t.plan(2);

    var a = {},
        differ = viscous(a);

    a.x = {};

    t.deepEqual(differ.changes(), [
        [
            ['1', [{}]]
        ],
        ['0', 'x','a', ['1']]
    ]);

    delete a.x;
    a.x = {};

    t.deepEqual(differ.changes(), [
        [
            ['2', [{}]],
            ['1', 'r']
        ],
        ['0', 'x','e', ['2']]
    ]);

});

test('functions', function(t){

    t.plan(2);

    var a = {},
        differ = viscous(a);

    a.x = function(){
        return 20;
    };
    a.x.y = {};

    var changes = differ.changes();

    t.deepEqual(changes[0][1][1][0].y, ['2']);

    t.deepEqual(changes, [
        [
            ['2', [{}]],
            ['1', [changes[0][1][1][0], 'f']], // deep equal doesnt like fns
        ],
        ['0', 'x','a', ['1']],
        ['1', 'y','a', ['2']]
    ]);


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
        differ = viscous(a);

    var obj = {};

    a.x = [obj, 1];

    t.deepEqual(differ.changes(), [
        [
            ['2', [{}]],
            ['1', [{0:['2'], 1:1}, 'a']]
        ],
        ['0', 'x','a', ['1']],
        ['1', '0','a', ['2']],
        ['1', '1','a', 1]
    ]);

    a.x.shift();
    a.x.push(obj);

    t.deepEqual(differ.changes(), [
        [],
        ['1', '0','e', 1],
        ['1', '1','e', ['2']],
    ]);

});

test('arrays with instances', function(t){

    t.plan(1);

    var a = {x:[{},{},{}]},
        differ = viscous(a);

    a.x = a.x.slice();

    t.deepEqual(differ.changes(), [
        [
            ['5', [{0:['2'], 1:['3'], 2:['4']}, 'a']],
            ['1', 'r']
       ],
        ['0', 'x', 'e', ['5']],
        ['5', '0', 'a', ['2']],
        ['5', '1', 'a', ['3']],
        ['5', '2', 'a', ['4']]
    ]);

});

test('array modification', function(t){

    t.plan(1);

    var a = {x:[1,2,3,4]},
        differ = viscous(a);

    a.x.splice(1, 1);

    t.deepEqual(differ.changes(), [
        [],
        [ '1', '3', 'r'],
        [ '1', '1', 'e', 3],
        [ '1', '2', 'e', 4]
     ]);

});

test('array properties', function(t){

    t.plan(1);

    var a = {x:[]};

    a.x.y = 'y';

    var differ = viscous(a);

    var state = differ.state();

    t.deepEqual(state, [
        [
            ['1', [{y:'y'}, 'a']],
            ['0', [{x:['1']}]]
        ]
    ]);
});

test('dates', function(t){

    t.plan(1);

    var a = {x:new Date(2016,1,1)},
        differ = viscous(a);

    t.deepEqual(differ.state(), [
        [
            ['1', ['2016-01-31T14:00:00.000Z', 'd']],
            ['0', [{x:['1']}]]
        ]
    ]);
});

test('state', function(t){

    t.plan(1);

    var a = {},
        differ = viscous(a);

    a.x = {};
    a.x.y = {};

    t.deepEqual(differ.state(), [[
        ['2', [{}]],
        ['1', [{y:['2']}]],
        ['0', [{x:['1']}]]
    ]]);

});

test('apply changes', function(t){

    t.plan(2);

    var a = {},
        differ = viscous(a);

    a.x = {};
    a.x.y = a.x;
    a.z = new Date(2016,1,1);

    var b = {},
        differ2 = viscous(b);

    differ2.apply(differ.changes());

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