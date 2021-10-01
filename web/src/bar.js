import { blue, red,  } from './color';

function Bar(props) {
  const { bluewr, redwr } = props;
  const barHeight = 30;
  const containerStyles = {
    height: barHeight,
    width: '100%',
    top: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)'
  }

  const blueBar = {
    width: `${bluewr}%`,
    height: barHeight,
    display: 'inline-block',
    backgroundColor: blue
  }
  
  const redBar = {
    width: `${redwr}%`,
    height: barHeight,
    display: 'inline-block',
    backgroundColor: red
  }
    
  const labelStyles = {
    top: '5px',
    color: 'black',
    fontWeight: 'bold',
    lineHeight: `${barHeight}px`,
  }
    
  return (
    <div style={containerStyles}>
      <div style={blueBar}>
        {bluewr > 1 && <span style={labelStyles}>{`${bluewr.toFixed(1)}%`}</span>}
      </div>
      <div style={redBar}>
        {redwr > 1 && <span style={labelStyles}>{`${redwr.toFixed(1)}%`}</span>}
      </div>
    </div>
  );
}

export default Bar