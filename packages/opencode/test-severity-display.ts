// Test file with eval to verify severity display
export class TestSeverity {
  execute(userCode: string): any {
    return eval(userCode);
  }
}
