'use strict';

var adapters = [
  ['local', 'http'],
  ['http', 'http'],
  ['http', 'local'],
  ['local', 'local']
];

var downAdapters = ['local'];
var deletedDocAdapters = [['local', 'http']];
var interHTTPAdapters = [['http', 'http']];

if (typeof module !== 'undefined' && module.exports) {
  downAdapters = [];
}

adapters.map(function (adapters) {
  describe('test.replication.js-' + adapters[0] + '-' + adapters[1], function () {

    var dbs = {};

    beforeEach(function (done) {
      dbs.name = testUtils.adapterUrl(adapters[0], 'test_repl');
      dbs.remote = testUtils.adapterUrl(adapters[1], 'test_repl_remote');
      testUtils.cleanup([dbs.name, dbs.remote], done);
    });

    afterEach(function (done) {
      testUtils.cleanup([dbs.name, dbs.remote], done);
    });


    var docs = [
      {_id: '0', integer: 0, string: '0'},
      {_id: '1', integer: 1, string: '1'},
      {_id: '2', integer: 2, string: '2'}
    ];

    it('Test basic pull replication', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      remote.bulkDocs({ docs: docs }, {}, function (err, results) {
        db.replicate.from(dbs.remote, function (err, result) {
          result.ok.should.equal(true);
          result.docs_written.should.equal(docs.length);
          done();
        });
      });
    });

    it('Test basic pull replication plain api', function (done) {
      var remote = new PouchDB(dbs.remote);
      remote.bulkDocs({ docs: docs }, {}, function (err, results) {
        PouchDB.replicate(dbs.remote, dbs.name, {}, function (err, result) {
          result.ok.should.equal(true);
          result.docs_written.should.equal(docs.length);
          done();
        });
      });
    });

    it('Test basic pull replication plain api 2', function (done) {
      var remote = new PouchDB(dbs.remote);
      remote.bulkDocs({ docs: docs }, {}, function (err, results) {
        PouchDB.replicate(dbs.remote, dbs.name, {
          complete: function (err, result) {
            result.ok.should.equal(true);
            result.docs_written.should.equal(docs.length);
            done();
          }
        });
      });
    });

    it('Local DB contains documents', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      remote.bulkDocs({ docs: docs }, {}, function (err, _) {
        db.bulkDocs({ docs: docs }, {}, function (err, _) {
          db.replicate.from(dbs.remote, function (err, _) {
            db.allDocs(function (err, result) {
              result.rows.length.should.equal(docs.length);
              done();
            });
          });
        });
      });
    });

    it('Test basic push replication', function (done) {
      var db = new PouchDB(dbs.name);
      db.bulkDocs({ docs: docs }, {}, function (err, results) {
        db.replicate.to(dbs.remote, function (err, result) {
          result.ok.should.equal(true);
          result.docs_written.should.equal(docs.length);
          done();
        });
      });
    });

    it('Test basic push replication take 2', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      db.bulkDocs({ docs: docs }, {}, function (err, _) {
        db.replicate.to(dbs.remote, function (err, _) {
          remote.allDocs(function (err, result) {
            result.rows.length.should.equal(docs.length);
            done();
          });
        });
      });
    });

    it('Test basic push replication sequence tracking', function (done) {
      var db = new PouchDB(dbs.name);
      var doc1 = {_id: 'adoc', foo: 'bar'};
      db.put(doc1, function (err, result) {
        db.replicate.to(dbs.remote, function (err, result) {
          result.docs_read.should.equal(1);
          db.replicate.to(dbs.remote, function (err, result) {
            result.docs_read.should.equal(0);
            db.replicate.to(dbs.remote, function (err, result) {
              result.docs_read.should.equal(0);
              done();
            });
          });
        });
      });
    });

    it('Test checkpoint', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      remote.bulkDocs({ docs: docs }, {}, function (err, results) {
        db.replicate.from(dbs.remote, function (err, result) {
          result.ok.should.equal(true);
          result.docs_written.should.equal(docs.length);
          db.replicate.from(dbs.remote, function (err, result) {
            result.ok.should.equal(true);
            result.docs_written.should.equal(0);
            result.docs_read.should.equal(0);
            done();
          });
        });
      });
    });

    it('Test continuous pull checkpoint', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      remote.bulkDocs({ docs: docs }, {}, function (err, results) {
        var changeCount = docs.length;
        var changes = db.changes({
          continuous: true,
          onChange: function (change) {
            if (--changeCount) {
              return;
            }
            replication.cancel();
            changes.cancel();
          },
          complete: function () {
            db.replicate.from(dbs.remote, {
              complete: function (err, details) {
                details.docs_read.should.equal(0);
                done();
              }
            });
          }
        });
        var replication = db.replicate.from(dbs.remote, { continuous: true });
      });
    });

    it('Test continuous push checkpoint', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      db.bulkDocs({ docs: docs }, {}, function (err, results) {
        var changeCount = docs.length;
        var finished = 0;
        var isFinished = function () {
          if (++finished !== 2) {
            return;
          }
          db.replicate.to(dbs.remote, {
            complete: function (err, details) {
              details.docs_read.should.equal(0);
              done();
            }
          });
        };
        var changes = remote.changes({
          continuous: true,
          onChange: function (change) {
            if (--changeCount) {
              return;
            }
            replication.cancel();
            changes.cancel();
          },
          complete: isFinished
        });
        var replication = db.replicate.to(dbs.remote, {
          continuous: true,
          complete: isFinished
        });
      });
    });

    it('Test checkpoint 2', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var doc = {_id: '3', count: 0};
      remote.put(doc, {}, function (err, results) {
        db.replicate.from(dbs.remote, function (err, result) {
          result.ok.should.equal(true);
          doc._rev = results.rev;
          doc.count++;
          remote.put(doc, {}, function (err, results) {
            doc._rev = results.rev;
            doc.count++;
            remote.put(doc, {}, function (err, results) {
              db.replicate.from(dbs.remote, function (err, result) {
                result.ok.should.equal(true);
                result.docs_written.should.equal(1);
                done();
              });
            });
          });
        });
      });
    });

    it('Test checkpoint 3 :)', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var doc = {_id: '3', count: 0};
      db.put(doc, {}, function (err, results) {
        PouchDB.replicate(db, remote, {}, function (err, result) {
          result.ok.should.equal(true);
          doc._rev = results.rev;
          doc.count++;
          db.put(doc, {}, function (err, results) {
            doc._rev = results.rev;
            doc.count++;
            db.put(doc, {}, function (err, results) {
              PouchDB.replicate(db, remote, {}, function (err, result) {
                result.ok.should.equal(true);
                result.docs_written.should.equal(1);
                done();
              });
            });
          });
        });
      });
    });

    it('Testing allDocs with some conflicts (issue #468)', function (done) {
      var db1 = new PouchDB(dbs.name);
      var db2 = new PouchDB(dbs.remote);
      // we indeed needed replication to create failing test here!
      var doc = {_id: 'foo', _rev: '1-a', value: 'generic'};
      db1.put(doc, { new_edits: false }, function (err, res) {
        db2.put(doc, { new_edits: false }, function (err, res) {
          testUtils.putAfter(db2, {
            _id: 'foo',
            _rev: '2-b',
            value: 'db2'
          }, '1-a', function (err, res) {
            testUtils.putAfter(db1, {
              _id: 'foo',
              _rev: '2-c',
              value: 'whatever'
            }, '1-a', function (err, res) {
              testUtils.putAfter(db1, {
                _id: 'foo',
                _rev: '3-c',
                value: 'db1'
              }, '2-c', function (err, res) {
                db1.get('foo', function (err, doc) {
                  doc.value.should.equal('db1');
                  db2.get('foo', function (err, doc) {
                    doc.value.should.equal('db2');
                    PouchDB.replicate(db1, db2, function () {
                      PouchDB.replicate(db2, db1, function () {
                        db1.get('foo', function (err, doc) {
                          doc.value.should.equal('db1');
                          db2.get('foo', function (err, doc) {
                            doc.value.should.equal('db1');
                            db1.allDocs({ include_docs: true }, function (err, res) {
                              res.rows.should.have.length.above(0);
                              // redundant but we want to test it
                              res.rows[0].doc.value.should.equal('db1');
                              db2.allDocs({ include_docs: true }, function (err, res) {
                                res.rows.should.have.length.above(0);
                                res.rows[0].doc.value.should.equal('db1');
                                done();
                              });
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });

    // CouchDB will not generate a conflict here, it uses a deteministic
    // method to generate the revision number, however we cannot copy its
    // method as it depends on erlangs internal data representation
    it('Test basic conflict', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var doc1 = {_id: 'adoc', foo: 'bar'};
      var doc2 = {_id: 'adoc', bar: 'baz'};
      db.put(doc1, function (err, localres) {
        remote.put(doc2, function (err, remoteres) {
          db.replicate.to(dbs.remote, function (err, _) {
            remote.get('adoc', { conflicts: true }, function (err, result) {
              result.should.have.property('_conflicts');
              done();
            });
          });
        });
      });
    });

    it('Test _conflicts key', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var doc1 = {_id: 'adoc', foo: 'bar'};
      var doc2 = {_id: 'adoc', bar: 'baz'};
      db.put(doc1, function (err, localres) {
        remote.put(doc2, function (err, remoteres) {
          db.replicate.to(dbs.remote, function (err, _) {
            var queryFun = {
              map: function (doc) {
                if (doc._conflicts) {
                  emit(doc._id, [doc._rev].concat(doc._conflicts));
                }
              }
            };
            remote.query(queryFun, {
              reduce: false,
              conflicts: true
            }, function (_, res) {
              res.rows.length.should.equal(1);
              done();
            });
          });
        });
      });
    });

    it('Test basic continuous pull replication', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var doc1 = {_id: 'adoc', foo: 'bar'};
      remote.bulkDocs({ docs: docs }, {}, function (err, results) {
        var count = 0;
        var finished = 0;
        var isFinished = function () {
          if (++finished !== 2) {
            return;
          }
          done();
        };
        var rep = db.replicate.from(dbs.remote, {
          continuous: true,
          complete: isFinished
        });
        var changes = db.changes({
          onChange: function (change) {
            ++count;
            if (count === 3) {
              return remote.put(doc1);
            }
            if (count === 4) {
              rep.cancel();
              changes.cancel();
            }
          },
          continuous: true,
          complete: isFinished
        });
      });
    });

    it('Test basic continuous push replication', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var doc1 = {_id: 'adoc', foo: 'bar'};
      db.bulkDocs({ docs: docs }, {}, function (err, results) {
        var count = 0;
        var finished = 0;
        var isFinished = function () {
          if (++finished !== 2) {
            return;
          }
          done();
        };
        var rep = remote.replicate.from(db, {
          continuous: true,
          complete: isFinished
        });
        var changes = remote.changes({
          onChange: function (change) {
            ++count;
            if (count === 3) {
              return db.put(doc1);
            }
            if (count === 4) {
              rep.cancel();
              changes.cancel();
            }
          },
          continuous: true,
          complete: isFinished
        });
      });
    });

    it('test-cancel-pull-replication', function (done) {
      new PouchDB(dbs.remote, function (err, remote) {
        var db = new PouchDB(dbs.name);
        var docs = [
          {_id: '0', integer: 0, string: '0'},
          {_id: '1', integer: 1, string: '1'},
          {_id: '2', integer: 2, string: '2'}
        ];
        var doc1 = {_id: 'adoc', foo: 'bar' };
        var doc2 = {_id: 'anotherdoc', foo: 'baz'};
        remote.bulkDocs({ docs: docs }, {}, function (err, results) {
          var count = 0;
          var replicate = db.replicate.from(remote, {
            continuous: true,
            complete: function () {
              remote.put(doc2);
              setTimeout(function () {
                changes.cancel();
              }, 100);
            }
          });
          var changes = db.changes({
            continuous: true,
            complete: function (err, reason) {
              count.should.equal(4);
              done();
            },
            onChange: function (change) {
              ++count;
              if (count === 3) {
                remote.put(doc1);
              }
              if (count === 4) {
                replicate.cancel();
              }
            }
          });
        });
      });
    });

    it('Replication filter', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var docs1 = [
        {_id: '0', integer: 0},
        {_id: '1', integer: 1},
        {_id: '2', integer: 2},
        {_id: '3', integer: 3}
      ];
      remote.bulkDocs({ docs: docs1 }, function (err, info) {
        db.replicate.from(remote, {
          complete: function (err, res) {
            if (err) { done(err); }
            db.allDocs(function (err, docs) {
              if (err) { done(err); }
              docs.rows.length.should.equal(2);
              done();
            });
          },
          filter: function (doc) {
            return doc.integer % 2 === 0;
          }
        });
      });
    });

    it('Replication with different filters', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var more_docs = [
        {_id: '3', integer: 3, string: '3'},
        {_id: '4', integer: 4, string: '4'}
      ];
      remote.bulkDocs({ docs: docs }, function (err, info) {
        db.replicate.from(remote, {
          filter: function (doc) {
            return doc.integer % 2 === 0;
          }
        }, function (err, response) {
          remote.bulkDocs({ docs: more_docs }, function (err, info) {
            db.replicate.from(remote, {}, function (err, response) {
              response.docs_written.should.equal(3);
              done();
            });
          });
        });
      });
    });

    it('Replication doc ids', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var thedocs = [
        {_id: '3', integer: 3, string: '3'},
        {_id: '4', integer: 4, string: '4'},
        {_id: '5', integer: 5, string: '5'}
      ];
      remote.bulkDocs({ docs: thedocs }, function (err, info) {
        db.replicate.from(remote, {
          doc_ids: ['3', '4']
        }, function (err, response) {
          response.docs_written.should.equal(2);
          done();
        });
      });
    });

    it('Replication since', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var thedocs = [
        {_id: '1', integer: 1, string: '1'},
        {_id: '2', integer: 2, string: '2'},
        {_id: '3', integer: 3, string: '3'},
        {_id: '4', integer: 4, string: '4'},
        {_id: '5', integer: 5, string: '5'}
      ];
      remote.bulkDocs({ docs: thedocs }, function (err, info) {
        db.replicate.from(remote, {
          since: 3,
          complete: function (err, result) {
            should.not.exist(err);
            result.docs_written.should.equal(2);
            db.replicate.from(remote, {
              since: 0,
              complete: function (err, result) {
                should.not.exist(err);
                result.docs_written.should.equal(3);
                done();
              }
            });
          }
        });
      });
    });

    it('Replication with same filters', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var more_docs = [
        {_id: '3', integer: 3, string: '3'},
        {_id: '4', integer: 4, string: '4'}
      ];
      remote.bulkDocs({ docs: docs }, function (err, info) {
        db.replicate.from(remote, {
          filter: function (doc) {
            return doc.integer % 2 === 0;
          }
        }, function (err, response) {
          remote.bulkDocs({ docs: more_docs }, function (err, info) {
            db.replicate.from(remote, {
              filter: function (doc) {
                return doc.integer % 2 === 0;
              }
            }, function (err, response) {
              response.docs_written.should.equal(1);
              done();
            });
          });
        });
      });
    });

    it('Replication with deleted doc', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var docs1 = [
        {_id: '0', integer: 0},
        {_id: '1', integer: 1},
        {_id: '2', integer: 2},
        {_id: '3', integer: 3},
        {_id: '4', integer: 4, _deleted: true}
      ];
      remote.bulkDocs({ docs: docs1 }, function (err, info) {
        db.replicate.from(remote, function () {
          db.allDocs(function (err, res) {
            res.total_rows.should.equal(4);
            done();
          });
        });
      });
    });

    it('Replication notifications', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var changes = 0;
      var onChange = function (c) {
        changes++;
        if (changes === 3) {
          done();
        }
      };
      remote.bulkDocs({ docs: docs }, {}, function (err, results) {
        db.replicate.from(dbs.remote, { onChange: onChange });
      });
    });

    it('Replication with remote conflict', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var doc = {_id: 'test', test: 'Remote 1'}, winningRev;
      remote.post(doc, function (err, resp) {
        doc._rev = resp.rev;
        PouchDB.replicate(remote, db, function (err, resp) {
          doc.test = 'Local 1';
          db.put(doc, function (err, resp) {
            doc.test = 'Remote 2';
            remote.put(doc, function (err, resp) {
              doc._rev = resp.rev;
              doc.test = 'Remote 3';
              remote.put(doc, function (err, resp) {
                winningRev = resp.rev;
                PouchDB.replicate(db, remote, function (err, resp) {
                  PouchDB.replicate(remote, db, function (err, resp) {
                    remote.get('test', { revs_info: true }, function (err, remotedoc) {
                      db.get('test', { revs_info: true }, function (err, localdoc) {
                        localdoc._rev.should.equal(winningRev);
                        remotedoc._rev.should.equal(winningRev);
                        done();
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });

    it('Replication of multiple remote conflicts (#789)', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var doc = {_id: '789', _rev: '1-a', value: 'test'};
      function createConflicts(db, callback) {
        db.put(doc, { new_edits: false }, function (err, res) {
          testUtils.putAfter(db, {
            _id: '789',
            _rev: '2-a',
            value: 'v1'
          }, '1-a', function (err, res) {
            testUtils.putAfter(db, {
              _id: '789',
              _rev: '2-b',
              value: 'v2'
            }, '1-a', function (err, res) {
              testUtils.putAfter(db, {
                _id: '789',
                _rev: '2-c',
                value: 'v3'
              }, '1-a', function (err, res) {
                callback();
              });
            });
          });
        });
      }
      createConflicts(remote, function () {
        db.replicate.from(remote, function (err, result) {
          result.ok.should.equal(true);
          // in this situation, all the conflicting revisions should be read and
          // written to the target database (this is consistent with CouchDB)
          result.docs_written.should.equal(3);
          result.docs_read.should.equal(3);
          done();
        });
      });
    });

    it('Replicate large number of docs', function (done) {
      this.timeout(15000);
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var docs = [];
      var num = 30;
      for (var i = 0; i < num; i++) {
        docs.push({
          _id: 'doc_' + i,
          foo: 'bar_' + i
        });
      }
      remote.bulkDocs({ docs: docs }, function (err, info) {
        db.replicate.from(remote, {}, function () {
          db.allDocs(function (err, res) {
            res.total_rows.should.equal(num);
            done();
          });
        });
      });
    });

    it('Ensure checkpoint after deletion', function (done) {
      var db1name = dbs.name;
      var adoc = { '_id': 'adoc' };
      var newdoc = { '_id': 'newdoc' };
      var db1 = new PouchDB(dbs.name);
      var db2 = new PouchDB(dbs.remote);
      db1.post(adoc, function () {
        PouchDB.replicate(db1, db2, {
          complete: function () {
            PouchDB.destroy(db1name, function () {
              var fresh = new PouchDB(db1name);
              fresh.post(newdoc, function () {
                PouchDB.replicate(fresh, db2, {
                  complete: function () {
                    db2.allDocs(function (err, docs) {
                      docs.rows.length.should.equal(2);
                      done();
                    });
                  }
                });
              });
            });
          }
        });
      });
    });

    it('issue #909 Filtered replication bails at paging limit', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var docs = [];
      var num = 100;
      for (var i = 0; i < num; i++) {
        docs.push({
          _id: 'doc_' + i,
          foo: 'bar_' + i
        });
      }
      num = 100;
      var docList = [];
      for (i = 0; i < num; i += 5) {
        docList.push('doc_' + i);
      }
      // uncomment this line to test only docs higher than paging limit
      docList = [
        'doc_33',
        'doc_60',
        'doc_90'
      ];
      remote.bulkDocs({ docs: docs }, {}, function (err, results) {
        db.replicate.from(dbs.remote, {
          continuous: false,
          doc_ids: docList
        }, function (err, result) {
          result.docs_written.should.equal(docList.length);
          done();
        });
      });
    });

    it('(#1240) - get error', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      // 10 test documents
      var num = 10;
      var docs = [];
      for (var i = 0; i < num; i++) {
        docs.push({
          _id: 'doc_' + i,
          foo: 'bar_' + i
        });
      }
      // Initialize remote with test documents
      remote.bulkDocs({ docs: docs }, {}, function (err, results) {
        var get = remote.get;
        function first_replicate() {
          // Mock remote.get to fail writing doc_3 (fourth doc)
          remote.get = function () {
            // Simulate failure to get the document with id 'doc_4'
            // This should block the replication at seq 4
            if (arguments[0] === 'doc_4') {
              arguments[2].apply(null, [{}]);
            } else {
              get.apply(this, arguments);
            }
          };
          // Replicate and confirm failure, docs_written and target docs
          db.replicate.from(remote, function (err, result) {
            should.exist(err);
            should.exist(result);
            result.docs_written.should.equal(4);
            function check_docs(id, result) {
              if (!id) {
                second_replicate();
                return;
              }
              db.get(id, function (err, exists) {
                if (exists) {
                  should.not.exist(err);
                } else {
                  should.exist(err);
                }
                check_docs(docs.shift());
              });
            }
            var docs = [
              [
                'doc_0',
                true
              ],
              [
                'doc_1',
                true
              ],
              [
                'doc_2',
                true
              ],
              [
                'doc_3',
                false
              ],
              [
                'doc_4',
                false
              ],
              [
                'doc_5',
                false
              ],
              [
                'doc_6',
                false
              ],
              [
                'doc_7',
                false
              ],
              [
                'doc_8',
                false
              ],
              [
                'doc_9',
                false
              ]
            ];
            check_docs(docs.shift());
          });
        }
        function second_replicate() {
          // Restore remote.get to original
          remote.get = get;
          // Replicate and confirm success, docs_written and target docs
          db.replicate.from(remote, function (err, result) {
            should.not.exist(err);
            should.exist(result);
            result.docs_written.should.equal(6);
            function check_docs(id, exists) {
              if (!id) {
                done();
                return;
              }
              db.get(id, function (err, result) {
                if (exists) {
                  should.not.exist(err);
                } else {
                  should.exist(err);
                }
                check_docs(docs.shift());
              });
            }
            var docs = [
              [
                'doc_0',
                true
              ],
              [
                'doc_1',
                true
              ],
              [
                'doc_2',
                true
              ],
              [
                'doc_3',
                true
              ],
              [
                'doc_4',
                true
              ],
              [
                'doc_5',
                true
              ],
              [
                'doc_6',
                true
              ],
              [
                'doc_7',
                true
              ],
              [
                'doc_8',
                true
              ],
              [
                'doc_9',
                true
              ]
            ];
            check_docs(docs.shift());
          });
        }
        // Done the test
        first_replicate();
      });
    });

    it('Get error 2', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      // 10 test documents
      var num = 10;
      var docs = [];
      for (var i = 0; i < num; i++) {
        docs.push({
          _id: 'doc_' + i,
          foo: 'bar_' + i
        });
      }
      // Initialize remote with test documents
      remote.bulkDocs({ docs: docs }, {}, function (err, results) {
        var get = remote.get;
        function first_replicate() {
          // Mock remote.get to fail writing doc_3 (fourth doc)
          remote.get = function () {
            // Simulate failure to get the document with id 'doc_4'
            // This should block the replication at seq 4
            if (arguments[0] === 'doc_4') {
              arguments[2].apply(null, [{
                status: 500,
                error: 'mock error',
                reason: 'mock get failure'
              }]);
            } else {
              get.apply(this, arguments);
            }
          };
          // Replicate and confirm failure, docs_written and target docs
          db.replicate.from(remote, function (err, result) {
            err.status.should.equal(500);
            err.error.should.equal('Replication aborted');
            err.reason.should.equal('src.get completed with error');
            err.details.status.should.equal(500);
            err.details.error.should.equal('mock error');
            err.details.reason.should.equal('mock get failure');
            result.errors[0].status.should.equal(500);
            result.errors[0].error.should.equal('mock error');
            result.errors[0].reason.should.equal('mock get failure');
            result.docs_written.should.equal(4);
            function check_docs(id, result) {
              if (!id) {
                second_replicate();
                return;
              }
              db.get(id, function (err, exists) {
                if (exists) {
                  should.not.exist(err);
                } else {
                  should.exist(err);
                }
                check_docs(docs.shift());
              });
            }
            var docs = [
              [
                'doc_0',
                true
              ],
              [
                'doc_1',
                true
              ],
              [
                'doc_2',
                true
              ],
              [
                'doc_3',
                false
              ],
              [
                'doc_4',
                false
              ],
              [
                'doc_5',
                false
              ],
              [
                'doc_6',
                false
              ],
              [
                'doc_7',
                false
              ],
              [
                'doc_8',
                false
              ],
              [
                'doc_9',
                false
              ]
            ];
            check_docs(docs.shift());
          });
        }
        function second_replicate() {
          // Restore remote.get to original
          remote.get = get;
          // Replicate and confirm success, docs_written and target docs
          db.replicate.from(remote, function (err, result) {
            should.not.exist(err);
            should.exist(result);
            result.docs_written.should.equal(6);
            function check_docs(id, exists) {
              if (!id) {
                done();
                return;
              }
              db.get(id, function (err, result) {
                if (exists) {
                  should.not.exist(err);
                } else {
                  should.exist(err);
                }
                check_docs(docs.shift());
              });
            }
            var docs = [
              [
                'doc_0',
                true
              ],
              [
                'doc_1',
                true
              ],
              [
                'doc_2',
                true
              ],
              [
                'doc_3',
                true
              ],
              [
                'doc_4',
                true
              ],
              [
                'doc_5',
                true
              ],
              [
                'doc_6',
                true
              ],
              [
                'doc_7',
                true
              ],
              [
                'doc_8',
                true
              ],
              [
                'doc_9',
                true
              ]
            ];
            check_docs(docs.shift());
          });
        }
        // Done the test
        first_replicate();
      });
    });

    it('(#1307) - replicate empty database', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      db.replicate.from(remote, function (err, result) {
        should.not.exist(err);
        should.exist(result);
        result.docs_written.should.equal(0);
        done();
      });
    });

    it('Test sync cancel', function (done) {
      var completed = 0;
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var replications = db.replicate.sync(remote, {
        complete: function (err, result) {
          completed++;
          if (completed === 2) {
            done();
          }
        }
      });
      replications.cancel();
    });

    it('Test syncing two endpoints (issue 838)', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var doc1 = {_id: 'adoc', foo: 'bar' };
      var doc2 = {_id: 'anotherdoc', foo: 'baz'};
      var finished = false;
      function onComplete() {
        if (finished) {
          db.allDocs(function (err, res) {
            var db_total = res.total_rows;
            remote.allDocs(function (err, res) {
              var remote_total = res.total_rows;
              db_total.should.equal(remote_total);
              done();
            });
          });
        } else {
          finished = true;
        }
      }
      db.put(doc1, function (err) {
        remote.put(doc2, function (err) {
          db.replicate.sync(remote, { complete: onComplete });
        });
      });
    });

    // This fails as it somehow triggers an xhr abort in the http adapter in node
    // which doesnt have xhr....
    it.skip('Syncing should stop if one replication fails (issue 838)', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var doc1 = {_id: 'adoc', foo: 'bar'};
      var doc2 = {_id: 'anotherdoc', foo: 'baz'};
      var finished = false;
      var replications = db.replicate.sync(remote, {
        continuous: true,
        complete: function () {
          if (finished) {
            return;
          }
          finished = true;
          remote.put(doc2, function (err) {
            setTimeout(function () {
              db.allDocs(function (err, res) {
                res.total_rows.should.be.below(2);
                done();
              });
            }, 100);
          });
        }
      });
      db.put(doc1, function (err) {
        replications.pull.cancel();
      });
    });

  });
});

// test a basic "initialize pouch" scenario when couch instance contains
// deleted revisions currently testing idb-http only
deletedDocAdapters.map(function (adapters) {

  describe('test.replication.js-' + adapters[0] + '-' + adapters[1], function () {

    var dbs = {};

    beforeEach(function (done) {
      dbs.name = testUtils.adapterUrl(adapters[0], 'test_repl');
      dbs.remote = testUtils.adapterUrl(adapters[1], 'test_repl_remote');
      testUtils.cleanup([dbs.name, dbs.remote], done);
    });

    afterEach(function (done) {
      testUtils.cleanup([dbs.name, dbs.remote], done);
    });

    it('doc count after multiple replications', function (done) {

      var runs = 2;
      // helper. remove each document in db and bulk load docs into same
      function rebuildDocuments(db, docs, callback) {
        db.allDocs({ include_docs: true }, function (err, response) {
          var count = 0;
          var limit = response.rows.length;
          if (limit === 0) {
            bulkLoad(db, docs, callback);
          }
          response.rows.forEach(function (doc) {
            db.remove(doc, function (err, response) {
              ++count;
              if (count === limit) {
                bulkLoad(db, docs, callback);
              }
            });
          });
        });
      }

      // helper.
      function bulkLoad(db, docs, callback) {
        db.bulkDocs({ docs: docs }, function (err, results) {
          if (err) {
            console.error('Unable to bulk load docs.  Err: ' + JSON.stringify(err));
            return;
          }
          callback(results);
        });
      }

      // a basic map function to mimic our testing situation
      function map(doc) {
        if (doc.common === true) {
          emit(doc._id, doc.rev);
        }
      }

      // The number of workflow cycles to perform. 2+ was always failing
      // reason for this test.
      var workflow = function (name, remote, x) {
        // some documents.  note that the variable Date component,
        //thisVaries, makes a difference.
        // when the document is otherwise static, couch gets the same hash
        // when calculating revision.
        // and the revisions get messed up in pouch
        var docs = [
          {
            _id: '0',
            integer: 0,
            thisVaries: new Date(),
            common: true
          },
          {
            _id: '1',
            integer: 1,
            thisVaries: new Date(),
            common: true
          },
          {
            _id: '2',
            integer: 2,
            thisVaries: new Date(),
            common: true
          },
          {
            _id: '3',
            integer: 3,
            thisVaries: new Date(),
            common: true
          }
        ];
        var dbr = new PouchDB(remote);
        rebuildDocuments(dbr, docs, function () {
          var db = new PouchDB(name);
          db.replicate.from(remote, function (err, result) {
            db.query({ map: map }, { reduce: false }, function (err, result) {
              result.rows.length.should.equal(docs.length);
              if (--x) {
                workflow(name, remote, x);
              } else {
                done();
              }
            });
          });
        });
      };

      workflow(dbs.name, dbs.remote, runs);
    });

    it('issue #300 rev id unique per doc', function (done) {
      var remote = new PouchDB(dbs.remote);
      var db = new PouchDB(dbs.name);
      var docs = [{ _id: 'a' }, { _id: 'b' }];
      remote.bulkDocs({ docs: docs }, {}, function (err, _) {
        db.replicate.from(dbs.remote, function (err, _) {
          db.allDocs(function (err, result) {
            result.rows.length.should.equal(2);
            result.rows[0].id.should.equal('a');
            result.rows[1].id.should.equal('b');
            done();
          });
        });
      });
    });

    it('issue #585 Store checkpoint on target db.', function (done) {
      var db = new PouchDB(dbs.name);
      var docs = [{ _id: 'a' }, { _id: 'b' }];
      db.bulkDocs({ docs: docs }, {}, function (err, _) {
        db.replicate.to(dbs.remote, function (err, result) {
          result.docs_written.should.equal(docs.length);
          PouchDB.destroy(dbs.remote, function (err, result) {
            db.replicate.to(dbs.remote, function (err, result) {
              result.docs_written.should.equal(docs.length);
              done();
            });
          });
        });
      });
    });

  });
});

// // This test only needs to run for one configuration, and it slows stuff
// // down
downAdapters.map(function (adapter) {

  describe('test.replication.js-down-test', function () {

    var dbs = {};

    beforeEach(function (done) {
      dbs.name = testUtils.adapterUrl(adapters[0], 'test_repl');
      testUtils.cleanup([dbs.name], done);
    });

    afterEach(function (done) {
      testUtils.cleanup([dbs.name], done);
    });

    it('replicate from down server test', function (done) {
      var db = new PouchDB(dbs.name);
      db.replicate.to('http://infiniterequest.com', function (err, changes) {
        should.exist(err);
        done();
      });
    });

  });
});


// Server side replication via `server: true` between http

interHTTPAdapters.map(function (adapters) {

  describe('test.replication.js-server', function () {

    var dbs = {};

    beforeEach(function (done) {
      dbs.name = testUtils.adapterUrl(adapters[0], 'test_repl');
      dbs.remote = testUtils.adapterUrl(adapters[1], 'test_repl_remote');
      testUtils.cleanup([dbs.name, dbs.remote], done);
    });

    afterEach(function (done) {
      testUtils.cleanup([dbs.name, dbs.remote], done);
    });

    var docs = [
      {_id: '0', integer: 0, string: '0'},
      {_id: '1', integer: 1, string: '1'},
      {_id: '2', integer: 2, string: '2'}
    ];

    it('Test basic replication', function (done) {
      var db = new PouchDB(dbs.name);
      db.bulkDocs({ docs: docs }, {}, function (err, results) {
        PouchDB.replicate(dbs.name, dbs.remote, {server: true }, function (err, result) {
          result.ok.should.equal(true);
          result.history[0].docs_written.should.equal(docs.length);
          done();
        });
      });
    });

    it('Test cancel continuous replication', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var doc1 = {_id: 'adoc', foo: 'bar'};
      var doc2 = {_id: 'anotherdoc', foo: 'baz'};
      remote.bulkDocs({ docs: docs }, {}, function (err, results) {
        var count = 0;
        var replicate = db.replicate.from(dbs.remote, {
          server: true,
          continuous: true
        });
        var changes = db.changes({
          continuous: true,
          onChange: function (change) {
            ++count;
            if (count === 3) {
              remote.put(doc1);
            }
            if (count === 4) {
              replicate.cancel();
              remote.put(doc2);
              // This setTimeout is needed to ensure no further changes come through
              setTimeout(function () {
                count.should.equal(4);
                changes.cancel();
                done();
              }, 500);
            }
          }
        });
      });
    });

    it('Test consecutive replications with different query_params', function (done) {
      var db = new PouchDB(dbs.name);
      var remote = new PouchDB(dbs.remote);
      var myDocs = [
        {_id: '0', integer: 0, string: '0'},
        {_id: '1', integer: 1, string: '1'},
        {_id: '2', integer: 2, string: '2'},
        {_id: '3', integer: 3, string: '3'},
        {_id: '4', integer: 5, string: '5'}
      ];
      remote.bulkDocs({ docs: myDocs }, {}, function (err, results) {
        var filterFun = function (doc, req) {
          if (req.query.even) {
            return doc.integer % 2 === 0;
          } else {
            return true;
          }
        };
        db.replicate.from(dbs.remote, {
          filter: filterFun,
          query_params: { 'even': true }
        }, function (err, result) {
          result.docs_written.should.equal(2);
          db.replicate.from(dbs.remote, {
            filter: filterFun,
            query_params: { 'even': false }
          }, function (err, result) {
            result.docs_written.should.equal(3);
            done();
          });
        });
      });
    });

  });
});
