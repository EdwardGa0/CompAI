import { useState, useEffect } from 'react';
import { getChampNames } from './api';
import Fuse from 'fuse.js';

function Search() {
  const [fuse, setFuse] = useState(new Fuse([]));
  const [comp, setComp] = useState(Array(10).fill(null));
  const [searchRes, setSearchRes] = useState('');
  const [test, setTest] = useState('');
  const [imgSrc, setImgSrc] = useState('');

  useEffect(() => {
    (async () => {
      const champNames = await getChampNames();
      setFuse(new Fuse(champNames));
    })();
  }, [])

  function handleChange(event) {
    const res = fuse.search(event.target.value);
    if (res.length) {
      setSearchRes(res[0].item);
      setImgSrc(`http://ddragon.leagueoflegends.com/cdn/11.19.1/img/champion/${res[0].item}.png`)
    }
    
    setTest(event.target.value);
  }

  function handleSubmit(event) {
    alert('A name was submitted: ' + test);
    event.preventDefault();
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <label>
          <input type="text" value={test} onChange={handleChange} />
        </label>
      </form>
      {searchRes}
      <img src={imgSrc} />
    </div>
  )
}

export default Search;