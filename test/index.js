var test = require('tape'),
    viscous = require('../'),
    statham = require('statham');

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
            ['1', a.x]
        ],
        ['0', 'x','a', ['1']]
    ]);

    a.y = 5;

    t.deepEqual(differ.changes(), [
        [],
        ['0', 'y','a', 5]
    ]);

});

test('deep instances', function(t){

    t.plan(1);

    var a = {},
        differ = viscous(a);

    a.x = {};
    a.x.y = {};

    t.deepEqual(differ.changes(), [
        [
            ['1', a.x],
            ['2', a.x.y]
        ],
        ['1', 'y','a', ['2']],
        ['0', 'x','a', ['1']]
    ]);

});

test('instance removed', function(t){

    t.plan(2);

    var a = {},
        differ = viscous(a);

    a.x = {};

    t.deepEqual(differ.changes(), [
        [
            ['1', a.x]
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
            ['1', a.x],
            ['2', a.x.y]
        ],
        ['1', 'y','a', ['2']],
        ['0', 'x','a', ['1']]
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
            ['1', a.x]
        ],
        ['0', 'x','a', ['1']]
    ]);

    delete a.x;
    a.x = {};

    t.deepEqual(differ.changes(), [
        [
            ['2', a.x],
            ['1', 'r']
        ],
        ['0', 'x','e', ['2']]
    ]);

});

test('functions', function(t){

    t.plan(1);

    var a = {},
        differ = viscous(a);

    a.x = function(){
        return 20;
    };
    a.x.y = {};

    t.deepEqual(differ.changes(), [
        [
            ['1', a.x],
            ['2', a.x.y]
        ],
        ['1', 'y','a', ['2']],
        ['0', 'x','a', ['1']]
    ]);

});

test('arrays', function(t){

    t.plan(2);

    var a = {},
        differ = viscous(a);

    var obj = {};

    a.x = [obj, 1];

    t.deepEqual(differ.changes(), [
        [
            ['1', a.x],
            ['2', obj]
        ],
        ['1', '0','a', ['2']],
        ['1', '1','a', 1],
        ['0', 'x','a', ['1']]
    ]);

    a.x.shift();
    a.x.push(obj);

    t.deepEqual(differ.changes(), [
        [],
        ['1', '0','e', 1],
        ['1', '1','e', ['2']],
    ]);

});

test('state', function(t){

    t.plan(1);

    var a = {},
        differ = viscous(a);

    a.x = {};
    a.x.y = {};

    t.deepEqual(differ.state(), [
        ['0', a],
        ['1', a.x],
        ['2', a.x.y]
    ]);

});

test('apply changes', function(t){

    t.plan(1);

    var a = {},
        differ = viscous(a);

    a.x = {};
    a.x.y = a.x;

    var b = {},
        differ2 = viscous(b);

    differ2.apply(differ.changes());

    t.deepEqual(b, a);

});

test('apply changes via stringify', function(t){

    t.plan(3);

    var a = {},
        differ = viscous(a);

    a.x = {};
    a.x.y = a.x;

    var b = {},
        differ2 = viscous(b);

    var changes = statham.parse(statham.stringify(differ.changes()));

    differ2.apply(changes);

    t.ok(b.x);
    t.ok(b.x.y);
    t.equal(b.x, b.x.y);

});