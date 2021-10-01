import { useState, useEffect } from 'react';
import { getChampNames, calcWR } from './api';
import Fuse from 'fuse.js';
import './search.css'
import { blue, red } from './color'
import Bar from './bar'

function Search() {
  const [fuse, setFuse] = useState(new Fuse([]));
  const [comp, setComp] = useState(
    new Array(10).fill().map(() => (
      { name: '', src: '' }
    ))
  );
  const [pos, setPos] = useState(0);
  const [search, setSearch] = useState('');
  const [done, setDone] = useState(false);
  const [bluewr, setBluewr] = useState(0);
  const [redwr, setRedwr] = useState(0);

  useEffect(() => {
    (async () => {
      const champNames = await getChampNames();
      setFuse(new Fuse(champNames));
    })();
  }, [])

  function handleChange(event) {
    const val = event.target.value;
    setSearch(val);
    if (val) {
      const res = fuse.search(val);
      if (res && res.length) {
        const newComp = [...comp];
        newComp[pos].name = res[0].item
        newComp[pos].src = `http://ddragon.leagueoflegends.com/cdn/11.19.1/img/champion/${res[0].item}.png`
        setComp(newComp);
      }
    } else {
      const newComp = [...comp];
      newComp[pos].name = ''
      newComp[pos].src = ''
      setComp(newComp);
    }
  }

  function handleSubmit(event) {
    setSearch('');
    if (pos === 9) {
      setDone(true);
      const champsStr = comp.map((champ) => champ.name).toString()
      alert(champsStr);
      calcWR(champsStr).then((res) => {
        console.log(res);
        setBluewr(res[0] * 100);
        setRedwr(res[1] * 100);
      })
    } else {
      if (pos < 5) {
        setPos(pos + 5);
      } else {
        setPos(pos - 4);
      }
    }
    event.preventDefault();
  }

  function squares() {
    return comp.map((champ, i) =>
      <div
        style={{
          background: i < 5 ? blue : red,
          opacity: pos === i || done ? 1 : 0.7,
        }}
        className='square'
        key={i}
      >
        {champ.src &&
            <img src={champ.src} />
        }
      </div>
    )
  }

  return (
    <div className='root'>
      <div className='square-grid'>
        {squares()}
        <div className='wr-bar'>
          <Bar bluewr={bluewr} redwr={redwr} />
        </div>
      </div>
      <form onSubmit={handleSubmit}>
        <label>
          <input
            className='search-bar'
            type='text'
            value={search}
            placeholder={`add a ${pos < 5 ? 'blue' : 'red'} side champion`}
            onChange={handleChange}
          />
        </label>
      </form>
    </div>
  )
}

export default Search;