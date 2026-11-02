package cache

import (
	"testing"
	"time"
)

func TestLRUBoundsExpiryAndCopies(t *testing.T) {
	c := New(264, time.Minute)
	c.Set("a", []byte("aa"))
	c.Set("b", []byte("bb"))
	a, ok := c.Get("a")
	if !ok {
		t.Fatal("miss")
	}
	a[0] = 'x'
	c.Set("c", []byte("cc"))
	if _, ok = c.Get("b"); ok {
		t.Fatal("LRU eviction")
	}
	a, _ = c.Get("a")
	if string(a) != "aa" {
		t.Fatal("alias mutation")
	}
	c.Set("oversize", make([]byte, 265))
	if c.used > 264 {
		t.Fatal("memory bound")
	}
	expired := New(264, 0)
	expired.Set("a", []byte("a"))
	if _, ok := expired.Get("a"); ok {
		t.Fatal("TTL")
	}
	c.Clear()
	if _, ok := c.Get("a"); ok {
		t.Fatal("clear")
	}
}
