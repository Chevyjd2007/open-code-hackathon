// Test file with eval to trigger CRITICAL severity scan
class TestEvaluator {
  execute(code) {
    return eval(code);
  }
}

module.exports = TestEvaluator;
