import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAndroidDesignSource } from './check-android-design.mjs';

test('rejects business UI primitives that bypass shared components', () => {
  const findings = checkAndroidDesignSource('Example.kt', `
    Button(onClick = {}) {}
    OutlinedTextField(value = name)
    androidx.compose.material3.AlertDialog(onDismissRequest = {})
    val color = Color(0xFF123456)
    Text(value, fontSize = 10.sp)
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {}
  `);
  assert.deepEqual(findings.map(item => item.rule), ['button', 'field', 'dialog', 'color', 'typography', 'spacing']);
  assert.equal(findings[0].line, 2);
});

test('allows shared components, compact spacing and dedicated input primitives', () => {
  assert.deepEqual(checkAndroidDesignSource('Example.kt', `
    AppButton(text = "保存", onClick = {})
    AppTextField(value = name, onValueChange = {})
    AppDialog(onDismissRequest = {}) {}
    BasicTextField(value = otp, onValueChange = {})
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {}
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {}
  `), []);
});

test('ignores documentation, string literals and import names', () => {
  assert.deepEqual(checkAndroidDesignSource('Example.kt', `
    import androidx.compose.material3.Button
    // Button() Color(0xFF123456)
    /* OutlinedTextField() */
    val help = "AlertDialog()"
    val snippet = """Color(0xFF123456)"""
  `), []);
});
