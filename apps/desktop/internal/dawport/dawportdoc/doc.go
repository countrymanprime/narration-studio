// Package dawportdoc holds the tests that pin the DAW reference (docs/reference/daw) to the DAW port's declarations. It is its own
// package because the tests import both adapters, which register themselves on import, and the registry tests in dawport need a
// binary with none registered.
package dawportdoc
