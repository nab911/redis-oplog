import {Collections, config} from './boot';
import {_} from 'meteor/underscore';
import './synthetic_mutators';
import helperGenerator from './lib/helpers';

_.each(Collections, (Collection, key) => {
    const {
        create,
        createSync,
        update,
        updateSync,
        remove,
        removeSync,
        subscribe,
        waitForHandleToBeReady
    } = helperGenerator(config[key].suffix);

    describe('It should work with: ' + key, function () {
        it('Should detect a removal', async function (done) {
            let handle = subscribe({
                game: 'chess',
            }, {
                sort: {score: -1},
                limit: 5
            });

            const cursor = Collection.find();
            var _id;

            let observeChangesHandle = cursor.observeChanges({
                removed(docId) {
                    if (docId == _id) {
                        observeChangesHandle.stop();
                        handle.stop();
                        done();
                    }
                }
            });

            await waitForHandleToBeReady(handle);

            _id = await createSync({game: 'chess', title: 'E'});
            remove({_id});
        });

        it('Should detect an insert', async function (done) {
            let handle = subscribe({
                game: 'chess',
            }, {
                sort: {score: -1},
                limit: 5
            });

            const cursor = Collection.find();

            let observeChangesHandle = cursor.observeChanges({
                added(docId, doc) {
                    if (doc.title === 'E') {
                        observeChangesHandle.stop();
                        handle.stop();
                        remove({_id: docId}, function () {
                            done();
                        });
                    }
                }
            });

            await waitForHandleToBeReady(handle);
            let data = cursor.fetch();

            assert.lengthOf(data, 3);

            create({
                game: 'chess',
                title: 'E'
            });
        });

        it('Should detect an update', async function (done) {
            let handle = subscribe({
                game: 'chess',
            }, {
                sort: {score: -1},
                limit: 5
            });

            const cursor = Collection.find();

            const observeChangesHandle = cursor.observeChanges({
                changed(docId) {
                    observeChangesHandle.stop();
                    handle.stop();
                    done();
                }
            });

            await waitForHandleToBeReady(handle);

            let data = cursor.fetch();

            update({_id: data[0]._id}, {
                $set: {
                    score: Math.random()
                }
            });
        });

        it('Should detect an update nested', async function (done) {
            let handle = subscribe({game: 'chess'});

            let docId = await createSync({
                game: 'chess',
                nested: {
                    a: 1,
                    b: 1,
                    c: {
                        a: 1
                    }
                }
            });

            const cursor = Collection.find();

            const observeChangesHandle = cursor.observeChanges({
                changed(docId, doc) {
                    observeChangesHandle.stop();
                    handle.stop();

                    assert.equal(doc.nested.b, 2);
                    assert.equal(doc.nested.c.b, 1);
                    assert.equal(doc.nested.c.a, 1);
                    assert.equal(doc.nested.d, 1);

                    remove({_id: docId}, () => {
                        done();
                    });
                }
            });

            await waitForHandleToBeReady(handle);

            update({_id: docId}, {
                $set: {
                    'nested.c.b': 1,
                    'nested.b': 2,
                    'nested.d': 1
                }
            });
        });

        it('Should not update multiple documents if not specified (multi:true)', async function (done) {
            let handle = subscribe({game: 'monopoly'});

            [_id1, id2] = await createSync([
                {game: 'monopoly', title: 'test'},
                {game: 'monopoly', title: 'test2'}
            ]);

            const cursor = Collection.find({game: 'monopoly'});

            const observeChangesHandle = cursor.observeChanges({
                changed(docId) {
                    assert.equal(docId, _id1);
                    remove({game: 'monopoly'});
                    observeChangesHandle.stop();
                    handle.stop();
                    done();
                }
            });

            await waitForHandleToBeReady(handle);

            update({game: 'monopoly'}, {$set: {score: Math.random()}});
        });

        // TODO: fix this test
        it('Should update multiple documents if specified', async function (done) {
            let handle = subscribe({game: 'monopoly2'});

            [_id1, id2] = await createSync([
                {game: 'monopoly2', title: 'test'},
                {game: 'monopoly2', title: 'test2'}
            ]);

            const cursor = Collection.find({game: 'monopoly2'});

            let changes = 0;
            const observeChangesHandle = cursor.observeChanges({
                changed(docId) {
                    changes += 1
                }
            });

            Tracker.autorun((c) => {
                if (!handle.ready()) return;
                c.stop();
                update({game: 'monopoly2'}, {
                    $set: {score: Math.random()}
                }, {multi: true}, (err, result) => {
                    observeChangesHandle.stop();
                    handle.stop();
                    remove({game: 'monopoly2'});
                    done(changes !== 2 && 'expected multiple changes');
                });
            });
        });

        it('Should detect an update of a non published document', async function (done) {
            let _id = await createSync({
                game: 'backgammon',
                title: 'test'
            });

            let handle = subscribe({
                game: 'chess',
            });

            const score = Math.random();
            const cursor = Collection.find();

            const observeChangesHandle = cursor.observeChanges({
                added(docId, doc) {
                    if (docId !== _id) return;

                    assert.equal(doc.game, 'chess');
                    assert.equal(doc.score, score);
                    assert.equal(doc.title, 'test');

                    observeChangesHandle.stop();
                    handle.stop();
                    remove({_id}, () => {
                        done();
                    });
                }
            });

            await waitForHandleToBeReady(handle);

            update({_id}, {$set: {game: 'chess', score}});
        });

        it('Should detect an update of a nested field when fields is specified', async function (done) {
            let _id = await createSync({
                "roles": {
                    "_groups": [
                        "company1",
                        "company2",
                        "company3"
                    ],
                    "_main": "company1",
                    "_global": {
                        "roles": [
                            "manage-users",
                            "manage-profiles",
                        ]
                    }
                }
            });

            let handle = subscribe({}, {
                fields: {roles: 1}
            });

            const cursor = Collection.find();
            const observeChangesHandle = cursor.observeChanges({
                changed(docId, doc) {
                    assert.equal(docId, _id);
                    handle.stop();
                    observeChangesHandle.stop();
                    done();
                    remove({_id})
                }
            });

            await waitForHandleToBeReady(handle);
            update({_id}, {$set: {'roles._main': 'company2'}});
        });

        it('Should update properly a nested field when a positional parameter is used', async function (done) {
            let _id = await createSync({
                "bom": [{
                    stockId: 1,
                    quantity: 1
                }, {
                    stockId: 2,
                    quantity: 2,
                }, {
                    stockId: 3,
                    quantity: 3
                }]
            });

            let handle = subscribe({}, {
                fields: {bom: 1}
            });

            const cursor = Collection.find();
            const observeChangesHandle = cursor.observeChanges({
                changed(docId, doc) {
                    assert.equal(docId, _id);
                    doc.bom.forEach(element => {
                        assert.isTrue(_.keys(element).length === 2);
                        if (element.stockId === 1) {
                            assert.equal(element.quantity, 30);
                        } else {
                            assert.equal(element.quantity, element.stockId)
                        }
                    });
                    handle.stop();
                    observeChangesHandle.stop();
                    remove({_id});
                    done();
                }
            });

            await waitForHandleToBeReady(handle);

            update({_id, 'bom.stockId': 1}, {
                $set: {'bom.$.quantity': 30}
            });
        });

        // it('Should detect a removal from client side', function (done) {
        //     create({
        //         game: 'chess',
        //         title: 'E'
        //     }, (err, _id) => {
        //         Collection.remove({ _id }, (err) => {
        //           done(err)
        //         });
        //     });
        // });

        it('Should detect an insert from client side', function (done) {
            Collection.insert({
                game: 'backgammon',
                title: 'E'
            }, (err, _id) => {
                if (err) return done(err);
                remove({_id}, done);
            });
        });

        it('Should detect an update from client side', function (done) {
            create({
                game: 'chess',
                title: 'E'
            }, (err, _id) => {
                Collection.update({_id}, {
                    $set: {score: Math.random()}
                }, (e) => {
                    if (e) return done(e);
                    remove({_id}, done);
                });
            });
        });

        ['server', 'client'].forEach(context => {
            it('Should work with $and operators: ' + context, async function (done) {
                let _id = await createSync({
                    orgid: '1',
                    siteIds: ['1', '2'],
                    Year: 2017
                });

                let handle = subscribe({
                    $and: [{
                        orgid: '1',
                    }, {
                        siteIds: {$in: ['1']}
                    }, {
                        'Year': {$in: [2017]}
                    }]
                });

                const cursor = Collection.find();
                let inChangedEvent = false;
                const observeChangesHandle = cursor.observeChanges({
                    changed(docId, doc) {
                        assert.equal(docId, _id);
                        inChangedEvent = true;
                        // assert.equal(doc.something, 30);
                    },
                    removed(docId) {
                        assert.isTrue(inChangedEvent);
                        assert.equal(docId, _id);

                        handle.stop();
                        observeChangesHandle.stop();
                        done();
                    }
                });

                await waitForHandleToBeReady(handle);
                let object = Collection.findOne(_id);
                assert.isObject(object);

                if (context == 'server') {
                    await updateSync({_id}, {$set: {'something': 30}});
                    await updateSync({_id}, {$set: {'Year': 2018}})
                } else {
                    Collection.update({_id}, {$set: {'something': 30}});
                    Collection.remove({_id});
                }
            });
        });

        it('Should be able to detect subsequent updates for direct processing with _ids', async function (done) {
            let [_id1, _id2] = await createSync([
                {subsequent_test: true, name: 'John Smith'},
                {subsequent_test: true, name: 'Michael Willow'},
            ]);

            let handle = subscribe({_id: {$in: [_id1, _id2]}}, {
                fields: {subsequent_test: 1, name: 1}
            });

            const cursor = Collection.find({subsequent_test: true});
            let inFirst = false;

            const observer = cursor.observeChanges({
                changed(docId, doc) {
                    if (docId == _id1) {
                        inFirst = true;
                        assert.equal('John Smithy', doc.name);
                    }
                    if (docId == _id2) {
                        assert.isTrue(inFirst);
                        assert.equal('Michael Willowy', doc.name);
                        handle.stop();
                        observer.stop();
                        done();
                    }
                }
            });

            await waitForHandleToBeReady(handle);

            await updateSync(_id1, {
                $set: {name: 'John Smithy'}
            });
            await updateSync(_id2, {
                $set: {name: 'Michael Willowy'}
            });
        });

        it ('Should work with the $addToSet', async function (done) {
            let _id = await createSync(
                {operators: true, connections: [1, 2], number: 10},
            );


            let handle = subscribe({_id});
            let cursor = Collection.find({_id});

            await waitForHandleToBeReady(handle);

            const observer = cursor.observeChanges({
                changed(docId, doc) {
                    assert.equal(docId, _id);
                    assert.lengthOf(doc.connections, 3);

                    observer.stop();
                    handle.stop();
                    done();
                }
            });

            await updateSync({ _id }, {
                $addToSet: {
                    connections: 3
                }
            });
        });

        it ('Should work with the $pull', async function (done) {
            let _id = await createSync(
                {operators: true, connections: [1, 2], number: 10},
            );

            let handle = subscribe({_id});
            let cursor = Collection.find({_id});

            await waitForHandleToBeReady(handle);

            const observer = cursor.observeChanges({
                changed(docId, doc) {
                    assert.equal(docId, _id);
                    assert.lengthOf(doc.connections, 1);

                    observer.stop();
                    handle.stop();
                    done();
                }
            });

            await updateSync({ _id }, {
                $pull: {
                    connections: 2
                }
            });
        });

        it ('Should work with the $pull and $set in combination', async function (done) {
            let _id = await createSync(
                {test_pull_and_set_combo: true, connections: [1], number: 10},
            );

            let handle = subscribe({test_pull_and_set_combo: true});
            let cursor = Collection.find({
                _id: {
                    $in: [_id]
                }
            }, {
                fields: {
                    connections: 1,
                    number: 1
                }
            });

            await waitForHandleToBeReady(handle);

            const observer = cursor.observeChanges({
                changed(docId, doc) {
                    assert.equal(docId, _id);
                    assert.equal(doc.number, 20);
                    assert.lengthOf(doc.connections, 0);

                    observer.stop();
                    handle.stop();
                    done();
                }
            });

            await updateSync(_id, {
                $pull: {
                    connections: {$in: [1]}
                },
                $set: {
                    number: 20
                }
            });
        })
    });
});
