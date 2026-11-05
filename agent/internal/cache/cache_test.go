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
	c.Clear()
	if _, ok := c.Get("a"); ok {
		t.Fatal("clear")
	}
}

func TestExpiryBoundary(t *testing.T) {
	for _, offset := range []time.Duration{-time.Nanosecond, 0, time.Nanosecond} {
		t.Run(offset.String(), func(t *testing.T) {
			now := time.Unix(100, 0)
			c := New(264, time.Minute)
			c.now = func() time.Time { return now }
			c.Set("a", []byte("aa"))
			now = now.Add(time.Minute + offset)
			_, ok := c.Get("a")
			if ok != (offset < 0) {
				t.Fatalf("cache hit at expiry offset %s: %v", offset, ok)
			}
			if !ok && (c.used != 0 || len(c.items) != 0 || c.order.Len() != 0) {
				t.Fatal("expired entry was not removed")
			}
		})
	}
}

func TestNonPositiveTTL(t *testing.T) {
	for _, ttl := range []time.Duration{0, -time.Nanosecond} {
		t.Run(ttl.String(), func(t *testing.T) {
			c := New(264, ttl)
			c.now = func() time.Time { return time.Unix(100, 0) }
			c.Set("a", []byte("aa"))
			if _, ok := c.Get("a"); ok {
				t.Fatal("non-positive TTL must expire even without a clock tick")
			}
		})
	}
}

func TestReadDoesNotExtendTTLAndReplacementResetsIt(t *testing.T) {
	now := time.Unix(100, 0)
	c := New(264, time.Minute)
	c.now = func() time.Time { return now }
	c.Set("a", []byte("old"))
	now = now.Add(30 * time.Second)
	if _, ok := c.Get("a"); !ok {
		t.Fatal("entry expired before TTL")
	}
	now = now.Add(30 * time.Second)
	if _, ok := c.Get("a"); ok {
		t.Fatal("read extended TTL")
	}
	c.Set("a", []byte("old"))
	now = now.Add(30 * time.Second)
	c.Set("a", []byte("new"))
	now = now.Add(30 * time.Second)
	if value, ok := c.Get("a"); !ok || string(value) != "new" {
		t.Fatal("replacement did not reset TTL or value")
	}
	now = now.Add(30 * time.Second)
	if _, ok := c.Get("a"); ok {
		t.Fatal("replacement did not expire at its own TTL")
	}
}

func TestClearAndExpiredRemovalZeroStoredCopies(t *testing.T) {
	now := time.Unix(100, 0)
	c := New(4096, time.Second)
	c.now = func() time.Time { return now }
	c.Set("a", []byte("transient data"))
	stored := c.items["a"].Value.(item).data
	c.Clear()
	for _, value := range stored {
		if value != 0 {
			t.Fatal("clear did not wipe stored bytes")
		}
	}
	c.Set("b", []byte("transient data"))
	stored = c.items["b"].Value.(item).data
	now = now.Add(2 * time.Second)
	c.PurgeExpired()
	for _, value := range stored {
		if value != 0 {
			t.Fatal("expiry did not wipe stored bytes")
		}
	}
	if bytes, entries := c.Usage(); bytes != 0 || entries != 0 {
		t.Fatal("expired storage retained")
	}
}
