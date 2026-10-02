# Types, methods, traits

## Records

`type Name|field Type|field Type=default<`. Fields start lowercase. Construct with `Name{field:value`.

```tl
type P|x int|y int=0<impl P|new x|P{x<norm self|self.x*self.x+self.y*self.y<shift self d|self.x+=d<<p P.new 3|p.shift 1|q P{..p y:2|print p.x p.norm(p==P{x:4 y:0})q
```
```text
4 16 true P{x: 4, y: 2}
```

- Construct `P{x:1 y:2`, pun locals `P{x y`, update `P{..p y:2`.
- Destructure `P{x y}p|…`. Fields `p.x`, mutate `p.x=5`.
- Methods: `impl T|name self args|body<`. A method without `self` is static: `P.new 3`.
- Receiver access is `self.field`. No inheritance; embed with a field `..inner T`.
- **Constructor**: an `init self args` method (write it first in the impl) makes the type callable: `V"1.2"` in TL and
  `new V("1.2")` from JavaScript both run it; `^other` inside `init` returns that instance instead. `V{…}` literals skip it.
- **Getters**: `get name self|body<` is read as `v.name` (also from JavaScript), without parentheses.
- **Extending a class**: `type Kid:Base|fields<` makes the type a subclass of a JavaScript class (`Error`,
  `events.EventEmitter`) or of another TL type. Methods and `is` checks follow the chain (`k is Base`). The base's
  `init` is not run for you: the subtype's `init` sets what it needs. A subclass of `Error` can be raised with `!`.
- **`is` with JavaScript classes**: `d is Date`, `e is RangeError`, `x is RegExp` are `instanceof` tests.

```tl
type V|major int|raw str<impl V|init self s|self.raw=s|self.major=int(s.split".")[0<get next self|self.major+1<<v V"7.1|w V"2|print v.major v.next w.raw
```
```text
7 8 2
```

## Enums

Variants start uppercase: plain `A`, positional `B int`, named `C{x int}`, discriminant `Ok=200`.

```tl
type Http|Ok=200|Missing=404<type Shape|Dot|Sq f64<print Http.Missing.code Dot(Sq 2.0)Shape.Dot
```
```text
404 Dot Sq(2) Dot
```

Match on variants: see match.md.

## Subclasses

```tl
type Base|a int<impl Base|init self a|self.a=a<twice self|self.a*2<<type Kid:Base|b int<impl Kid|init self a b|self.a=a|self.b=b<sum self|self.a+self.b<<k Kid 3 4|print k.twice k.sum(k is Base)(k is Kid
```
```text
6 7 true true
```

```tl
type Oops:Error|code int<impl Oops|init self code msg|self.code=code|self.message=msg<<fn f|!(Oops 7"boom<try|f?<catch e|print e.message e.code(e is Oops)(e is Error
```
```text
boom 7 true true
```

## Tuple structs and newtypes

```tl
type Meters(f64;m Meters 3.5|print m.0 m
```
```text
3.5 Meters(3.5)
```

## Traits

`trait Name|required self;default self|body<<` then `impl Name Type|…`. Required methods end with `;`.
A `text self` method is what `print` shows.

```tl
type P|x int<trait Sw|text self>str;show self|print"[$self.text]<<impl Sw P|text self|"P($self.x)<<p P{x:4|p.show|print p
```
```text
[P(4)]
P(4)
```

## Extensions on built-in types

`ext str|…`, `ext list|…`, `ext map|…`, `ext num|…`.

```tl
ext str|shout self|self.upper+"!<<ext list|second self|self[1<<print"hi".shout [7 8 9].second
```
```text
HI! 8
```
