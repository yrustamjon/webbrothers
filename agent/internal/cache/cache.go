package cache

import (
	"container/list"
	"sync"
	"time"
)

type item struct {
	key     string
	data    []byte
	expires time.Time
}
type Cache struct {
	mu        sync.Mutex
	max, used int
	ttl       time.Duration
	now       func() time.Time
	items     map[string]*list.Element
	order     *list.List
}

func New(max int, ttl time.Duration) *Cache {
	return &Cache{max: max, ttl: ttl, now: time.Now, items: map[string]*list.Element{}, order: list.New()}
}
func (c *Cache) remove(e *list.Element) {
	i := e.Value.(item)
	delete(c.items, i.key)
	c.used -= len(i.key) + len(i.data) + 128
	clear(i.data)
	c.order.Remove(e)
}
func (c *Cache) Get(key string) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.items[key]
	if !ok {
		return nil, false
	}
	i := e.Value.(item)
	if !c.now().Before(i.expires) {
		c.remove(e)
		return nil, false
	}
	c.order.MoveToFront(e)
	return append([]byte(nil), i.data...), true
}
func (c *Cache) Set(key string, data []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if e, ok := c.items[key]; ok {
		c.remove(e)
	}
	cost := len(key) + len(data) + 128
	if cost > c.max {
		return
	}
	for c.used+cost > c.max {
		c.remove(c.order.Back())
	}
	c.items[key] = c.order.PushFront(item{key, append([]byte(nil), data...), c.now().Add(c.ttl)})
	c.used += cost
}
func (c *Cache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	for e := c.order.Back(); e != nil; {
		previous := e.Prev()
		c.remove(e)
		e = previous
	}
	c.items = map[string]*list.Element{}
	c.order.Init()
	c.used = 0
}

// PurgeExpired removes expired values even when those keys are not requested again.
func (c *Cache) PurgeExpired() {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	for e := c.order.Back(); e != nil; {
		previous := e.Prev()
		if !now.Before(e.Value.(item).expires) {
			c.remove(e)
		}
		e = previous
	}
}
func (c *Cache) Usage() (bytes, entries int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.used, len(c.items)
}
